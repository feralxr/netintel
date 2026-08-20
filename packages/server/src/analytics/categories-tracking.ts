import { db } from "../db/client.js";
import { dnsEvents, domainCategories } from "../db/schema.js";
import { isTrackerCategory } from "./categorization.js";

export interface CategoryBreakdown {
  category: string;
  queries: number;
  uniqueDomains: number;
  share: number;
}

/**
 * Metric #9 — Domain Categories: query volume and unique-domain count per
 * category, joined from dns_events (source of truth) against domain_categories.
 */
export function categoryBreakdown(): CategoryBreakdown[] {
  const categoryByDomain = new Map(db.select().from(domainCategories).all().map((c) => [c.domain, c.category]));
  const events = db.select({ domain: dnsEvents.domain }).from(dnsEvents).all();

  const counts = new Map<string, { queries: number; domains: Set<string> }>();
  for (const e of events) {
    const category = categoryByDomain.get(e.domain) ?? "uncategorized";
    const bucket = counts.get(category) ?? { queries: 0, domains: new Set<string>() };
    bucket.queries++;
    bucket.domains.add(e.domain);
    counts.set(category, bucket);
  }

  const total = events.length;
  return [...counts.entries()]
    .map(([category, v]) => ({
      category,
      queries: v.queries,
      uniqueDomains: v.domains.size,
      share: total > 0 ? v.queries / total : 0,
    }))
    .sort((a, b) => b.queries - a.queries);
}

/**
 * Metric #10 — First-Party vs. Third-Party Activity.
 * v1 approximation (DNS-only signal, documented limitation): categories that
 * are structurally third-party in nature (advertising, analytics, telemetry,
 * cdn) are treated as third-party; everything else counts as first-party.
 * This is a proxy, not a true request-referrer-based first/third-party split.
 */
const THIRD_PARTY_CATEGORIES = new Set(["advertising", "analytics", "telemetry", "cdn"]);

export function firstPartyVsThirdParty() {
  const breakdown = categoryBreakdown();
  const thirdParty = breakdown.filter((b) => THIRD_PARTY_CATEGORIES.has(b.category)).reduce((s, b) => s + b.queries, 0);
  const total = breakdown.reduce((s, b) => s + b.queries, 0);
  return {
    thirdPartyQueries: thirdParty,
    firstPartyQueries: total - thirdParty,
    thirdPartyRatio: total > 0 ? thirdParty / total : 0,
  };
}

/**
 * Metric #11 — Tracking Footprint: ad/analytics/telemetry-category activity.
 */
export function trackingFootprint() {
  const categoryByDomain = db.select().from(domainCategories).all();
  const trackerDomains = new Set(categoryByDomain.filter((c) => isTrackerCategory(c.category)).map((c) => c.domain));

  const events = db.select({ domain: dnsEvents.domain, clientId: dnsEvents.clientId }).from(dnsEvents).all();
  const trackerEvents = events.filter((e) => trackerDomains.has(e.domain));

  const total = events.length;
  return {
    trackerQueries: trackerEvents.length,
    uniqueTrackers: trackerDomains.size,
    trackerRatio: total > 0 ? trackerEvents.length / total : 0,
    topTrackers: [...trackerDomains]
      .map((domain) => ({ domain, count: trackerEvents.filter((e) => e.domain === domain).length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}
