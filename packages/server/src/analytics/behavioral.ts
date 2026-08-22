import { db } from "../db/client.js";
import { dnsEvents, domains, devices } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { domainRevisitIntervals } from "./domain-metrics.js";
import { timeOfDayBehavior, dayOfWeekBehavior, computeSessions } from "./time-behavior.js";
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

// -----------------------------------------------------------------------
// Metric #78 — Multi-Device Session Overlap
//   Detects concurrent active sessions across devices — household/office
//   usage-overlap context (e.g. "everyone's online 7-9pm"), not any form
//   of cross-device identity linking.
// -----------------------------------------------------------------------
export function multiDeviceSessionOverlap() {
  const activeDevices = db.select().from(devices).where(eq(devices.isActive, true)).all();
  const allSessions = activeDevices.flatMap((d) => computeSessions(d.deviceId));

  if (allSessions.length === 0) return { overlaps: [], maxConcurrentDevices: 0 };

  // Sweep-line over session start/end events to find max concurrency and
  // notable overlap windows (>=2 devices active at once).
  type Point = { t: number; delta: number; clientId: string };
  const points: Point[] = [];
  for (const s of allSessions) {
    points.push({ t: new Date(s.start).getTime(), delta: 1, clientId: s.clientId });
    points.push({ t: new Date(s.end).getTime(), delta: -1, clientId: s.clientId });
  }
  points.sort((a, b) => a.t - b.t);

  let concurrent = 0;
  let maxConcurrent = 0;
  const overlapWindows: { start: string; deviceCount: number }[] = [];
  for (const p of points) {
    concurrent += p.delta;
    if (concurrent > maxConcurrent) maxConcurrent = concurrent;
    if (concurrent >= 2) overlapWindows.push({ start: new Date(p.t).toISOString(), deviceCount: concurrent });
  }

  return {
    maxConcurrentDevices: maxConcurrent,
    overlapWindowCount: overlapWindows.length,
    note: "Reflects concurrent session activity, not identity-linking between devices.",
  };
}

// -----------------------------------------------------------------------
// Metric #79 — Domain Sequence Fingerprint
//   Short recurring A->B->C in-session navigation sequences, treated as a
//   fingerprint of routine behavior (e.g. a morning news->email->work chain).
// -----------------------------------------------------------------------
export function domainSequenceFingerprint(minOccurrences = 3, sequenceLength = 3, limit = 15) {
  const activeDevices = db.select().from(devices).where(eq(devices.isActive, true)).all();
  const allSessions = activeDevices.flatMap((d) => computeSessions(d.deviceId));

  const sequenceCounts = new Map<string, number>();
  for (const s of allSessions) {
    const seq = s.domainSequence;
    for (let i = 0; i + sequenceLength <= seq.length; i++) {
      const chunk = seq.slice(i, i + sequenceLength);
      if (new Set(chunk).size === 1) continue; // skip trivial A->A->A repeats
      const key = chunk.join(" -> ");
      sequenceCounts.set(key, (sequenceCounts.get(key) ?? 0) + 1);
    }
  }

  return [...sequenceCounts.entries()]
    .filter(([, count]) => count >= minOccurrences)
    .map(([sequence, count]) => ({ sequence, occurrences: count }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, limit);
}

// -----------------------------------------------------------------------
// Metric #80 — Dwell-Implied Engagement
//   WEAK proxy only: repeat sub-resolution queries (a domain and its
//   subdomains queried multiple times within one session) as a stand-in
//   for engagement. Explicitly NOT real dwell time or page-level activity —
//   DNS cannot observe that.
// -----------------------------------------------------------------------
export function dwellImpliedEngagement(clientId: string, limit = 15) {
  const sessions = computeSessions(clientId);
  const results: { registeredDomainSample: string; sessionStart: string; repeatQueries: number }[] = [];

  for (const s of sessions) {
    const counts = new Map<string, number>();
    for (const d of s.domainSequence) counts.set(d, (counts.get(d) ?? 0) + 1);
    for (const [domain, count] of counts.entries()) {
      if (count >= 3) results.push({ registeredDomainSample: domain, sessionStart: s.start, repeatQueries: count });
    }
  }

  return {
    clientId,
    candidates: results.sort((a, b) => b.repeatQueries - a.repeatQueries).slice(0, limit),
    note: "A weak DNS-only proxy for engagement (repeat queries within a session) — never real page dwell time, which DNS traffic cannot observe.",
  };
}

// -----------------------------------------------------------------------
// Metric #81 — Automation vs Human Pattern Classifier
//   Combines #41's periodicity with #8's session diversity into one score:
//   high periodicity + low diversity leans "automated/scripted"; low
//   periodicity + high diversity leans "human-driven browsing".
// -----------------------------------------------------------------------
export function automationVsHumanClassifier(clientId: string) {
  const sessions = computeSessions(clientId);
  if (sessions.length === 0) {
    return { clientId, classification: "unknown" as const, note: "No session history yet for this device." };
  }

  const avgDiversity = sessions.reduce((s, sess) => s + sess.diversity, 0) / sessions.length;

  const clientDomains = db.select({ domain: dnsEvents.domain }).from(dnsEvents).where(eq(dnsEvents.clientId, clientId)).all();
  const uniqueDomains = [...new Set(clientDomains.map((d) => d.domain))];
  const domainRows = uniqueDomains.length > 0 ? db.select().from(domains).all().filter((d) => uniqueDomains.includes(d.domain)) : [];

  const periodicityScores = domainRows
    .filter((d) => d.queryCount >= 5)
    .map((d) => {
      const dist = domainRevisitIntervals(d.domain);
      const cv = dist.mean > 0 ? dist.stddev / dist.mean : 1;
      return Math.max(0, 1 - Math.min(cv, 1));
    });
  const avgPeriodicity = periodicityScores.length > 0 ? periodicityScores.reduce((a, b) => a + b, 0) / periodicityScores.length : 0;

  // automationScore in [0,1]: high periodicity + low session diversity -> automated
  const automationScore = 0.5 * avgPeriodicity + 0.5 * (1 - avgDiversity);
  const classification = automationScore > 0.65 ? "likely_automated" : automationScore < 0.35 ? "likely_human" : "mixed";

  return { clientId, automationScore, avgPeriodicity, avgSessionDiversity: avgDiversity, classification, note: "Heuristic classification, not a certainty — a single device running both apps and background services will land in 'mixed'." };
}
