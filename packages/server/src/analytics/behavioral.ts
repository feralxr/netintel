import { db } from "../db/client.js";
import { dnsEvents, domains } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { domainRevisitIntervals } from "./domain-metrics.js";
import { timeOfDayBehavior, dayOfWeekBehavior } from "./time-behavior.js";
import { categoryBreakdown } from "./categories-tracking.js";

// -----------------------------------------------------------------------
// Metric #38 — Application Detection
//   v1 heuristic: category + registered-domain signature -> a likely app
//   label. ALWAYS returned as inference with a confidence, never as fact —
//   DNS traffic alone cannot confirm which application generated a query.
// -----------------------------------------------------------------------
const APP_SIGNATURES: { match: string; app: string; confidence: number }[] = [
  { match: "netflix.com", app: "Netflix app/browser", confidence: 0.7 },
  { match: "spotify.com", app: "Spotify app", confidence: 0.7 },
  { match: "steamcommunity.com", app: "Steam client", confidence: 0.6 },
  { match: "steampowered.com", app: "Steam client", confidence: 0.6 },
  { match: "discord.com", app: "Discord app", confidence: 0.65 },
  { match: "chatgpt.com", app: "ChatGPT app/browser", confidence: 0.6 },
  { match: "windowsupdate.com", app: "Windows Update background service", confidence: 0.8 },
];

export function detectApplication(domain: string) {
  const hit = APP_SIGNATURES.find((s) => domain === s.match || domain.endsWith(`.${s.match}`));
  if (hit) return { domain, likelyApp: hit.app, confidence: hit.confidence, isInference: true };
  return { domain, likelyApp: null, confidence: 0, isInference: true };
}

// -----------------------------------------------------------------------
// Metric #39 — Search vs. Direct-Navigation Browsing
//   v1 approximation from category shares: DNS gives category-level
//   signals, not exact page-level browsing history.
// -----------------------------------------------------------------------
export function searchVsDirectNavigation() {
  const breakdown = categoryBreakdown();
  const byCategory = new Map(breakdown.map((b) => [b.category, b]));

  const search = byCategory.get("search")?.queries ?? 0;
  const social = byCategory.get("social")?.queries ?? 0;
  const content = (byCategory.get("streaming")?.queries ?? 0) + (byCategory.get("news")?.queries ?? 0) + (byCategory.get("entertainment")?.queries ?? 0);
  const total = breakdown.reduce((s, b) => s + b.queries, 0);
  const direct = Math.max(0, total - search - social - content);

  return {
    total,
    search: { queries: search, share: total > 0 ? search / total : 0 },
    social: { queries: social, share: total > 0 ? social / total : 0 },
    content: { queries: content, share: total > 0 ? content / total : 0 },
    directNavigation: { queries: direct, share: total > 0 ? direct / total : 0 },
    note: "DNS-only approximation by category share, not a true page-level browsing classification.",
  };
}

// -----------------------------------------------------------------------
// Metric #41 — Periodicity Detection:  CV = stddev/mean ; Periodicity = 1-CV
// -----------------------------------------------------------------------
export function periodicity(domain: string) {
  const dist = domainRevisitIntervals(domain);
  const cv = dist.mean > 0 ? dist.stddev / dist.mean : 1;
  const periodicityScore = Math.max(0, 1 - Math.min(cv, 1));
  return { domain, coefficientOfVariation: cv, periodicityScore, sampleSize: dist.count };
}

/** Domains with the most regular (highest periodicity) query patterns — candidate background/telemetry traffic. */
export function mostPeriodicDomains(limit = 20) {
  const all = db.select().from(domains).all().filter((d) => d.queryCount >= 5);
  return all
    .map((d) => periodicity(d.domain))
    .filter((p) => p.sampleSize >= 3)
    .sort((a, b) => b.periodicityScore - a.periodicityScore)
    .slice(0, limit);
}

// -----------------------------------------------------------------------
// Metric #40 — Background vs. Interactive Traffic
//   High periodicity + regular intervals = likely background; everything
//   else defaults to interactive. A heuristic split, not a certainty.
// -----------------------------------------------------------------------
export function backgroundVsInteractive() {
  const all = db.select().from(domains).all().filter((d) => d.queryCount >= 3);
  const scored = all.map((d) => periodicity(d.domain));

  const background = scored.filter((s) => s.periodicityScore > 0.6 && s.sampleSize >= 3);
  const interactive = scored.filter((s) => s.periodicityScore <= 0.6 || s.sampleSize < 3);

  const totalQueries = all.reduce((s, d) => s + d.queryCount, 0);
  const backgroundQueries = all
    .filter((d) => background.some((b) => b.domain === d.domain))
    .reduce((s, d) => s + d.queryCount, 0);

  return {
    backgroundDomainCount: background.length,
    interactiveDomainCount: interactive.length,
    backgroundQueryShare: totalQueries > 0 ? backgroundQueries / totalQueries : 0,
    topBackgroundDomains: background.sort((a, b) => b.periodicityScore - a.periodicityScore).slice(0, 10),
  };
}

// -----------------------------------------------------------------------
// Metric #46 — Internet Routine Detection
//   Buckets time/day patterns into workday/weekend and high/low-activity
//   regimes using existing day-of-week and time-of-day breakdowns.
// -----------------------------------------------------------------------
export function internetRoutine() {
  const events = db.select({ timestamp: dnsEvents.timestamp }).from(dnsEvents).all();
  const byDay = dayOfWeekBehavior(events);
  const byHour = timeOfDayBehavior(events);

  const weekdayTotal = byDay
    .filter((d) => !["Saturday", "Sunday"].includes(d.day))
    .reduce((s, d) => s + d.queries, 0);
  const weekendTotal = byDay.filter((d) => ["Saturday", "Sunday"].includes(d.day)).reduce((s, d) => s + d.queries, 0);

  const avgHourly = byHour.total / 24;
  const highActivityHours = byHour.hourCounts
    .map((c, hour) => ({ hour, count: c }))
    .filter((h) => h.count > avgHourly * 1.3);
  const lowActivityHours = byHour.hourCounts
    .map((c, hour) => ({ hour, count: c }))
    .filter((h) => h.count < avgHourly * 0.5);

  return {
    weekdayQueries: weekdayTotal,
    weekendQueries: weekendTotal,
    weekdayVsWeekendRatio: weekendTotal > 0 ? weekdayTotal / weekendTotal : null,
    highActivityHours: highActivityHours.map((h) => h.hour),
    lowActivityHours: lowActivityHours.map((h) => h.hour),
    peakHour: byHour.peakHour,
  };
}
