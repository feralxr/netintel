import { db } from "../db/client.js";
import { dnsEvents, domains, devices, domainCategories, alertEvents, insights } from "../db/schema.js";
import { eq, and, gte, lte } from "drizzle-orm";
import { shannonEntropy } from "./stats.js";

// -----------------------------------------------------------------------
// Metric #14 — NXDOMAIN Analysis
// -----------------------------------------------------------------------
export function nxdomainAnalysis() {
  const events = db.select({ responseCode: dnsEvents.responseCode, domain: dnsEvents.domain }).from(dnsEvents).all();
  const total = events.length;
  const nx = events.filter((e) => e.responseCode === "NXDOMAIN");

  const perDomain = new Map<string, number>();
  for (const e of nx) perDomain.set(e.domain, (perDomain.get(e.domain) ?? 0) + 1);

  return {
    totalQueries: total,
    nxdomainCount: nx.length,
    nxRate: total > 0 ? nx.length / total : 0,
    topNxDomains: [...perDomain.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}

// -----------------------------------------------------------------------
// Metric #15 — Domain Entropy
//   Shannon entropy of a domain's character distribution. Used as ONE
//   feature among several for spotting suspicious/DGA-like domains —
//   never returned or treated as standalone proof of anything.
// -----------------------------------------------------------------------
export function domainCharacterEntropy(domain: string): number {
  // Score entropy on the registrable label only (strip TLD/subdomains'
  // punctuation) so short common TLDs don't dilute the signal.
  const label = domain.split(".")[0] ?? domain;
  const charCounts = new Map<string, number>();
  for (const ch of label) charCounts.set(ch, (charCounts.get(ch) ?? 0) + 1);
  return shannonEntropy([...charCounts.values()]);
}

/** High-entropy domains currently in the dataset — a candidate list, not a verdict. */
export function highEntropyDomains(threshold = 3.5, limit = 20) {
  const all = db.select().from(domains).all();
  return all
    .map((d) => ({ domain: d.domain, entropy: domainCharacterEntropy(d.domain), queryCount: d.queryCount }))
    .filter((d) => d.entropy >= threshold)
    .sort((a, b) => b.entropy - a.entropy)
    .slice(0, limit);
}

// -----------------------------------------------------------------------
// Metric #13 — Security Analytics
//   Unified surface combining the individual security metrics (#12, #14,
//   #15, #16) into one payload, matching the Bible's description of #13
//   as a single combined view rather than a separately-computed metric.
// -----------------------------------------------------------------------
export function unifiedSecurityAnalytics() {
  const events = db.select({ responseCode: dnsEvents.responseCode, blocked: dnsEvents.blocked }).from(dnsEvents).all();
  const total = events.length;
  const nx = events.filter((e) => e.responseCode === "NXDOMAIN").length;
  const servfail = events.filter((e) => e.responseCode === "SERVFAIL").length;
  const refused = events.filter((e) => e.responseCode === "REFUSED").length;
  const blocked = events.filter((e) => e.blocked).length;

  return {
    totalQueries: total,
    nxdomain: { count: nx, rate: total > 0 ? nx / total : 0 },
    servfail: { count: servfail, rate: total > 0 ? servfail / total : 0 },
    refused: { count: refused, rate: total > 0 ? refused / total : 0 },
    blocked: { count: blocked, rate: total > 0 ? blocked / total : 0 },
    suspiciousDomains: highEntropyDomains(3.5, 10),
    newDomains: newlyObservedDomains(1, 10),
  };
}
// -----------------------------------------------------------------------
// Metric #56 — Suspicious TLD Exposure
//   Tracked as a TREND only — a TLD appearing here is not itself evidence
//   of anything; plenty of legitimate sites use these TLDs. Never used as
//   a block signal on its own.
// -----------------------------------------------------------------------
const WATCHED_TLDS = ["zip", "xyz", "top", "click", "work", "gq", "tk", "cf", "ml", "loan", "download"];

export function suspiciousTldExposure() {
  const rows = db.select({ domain: dnsEvents.domain }).from(dnsEvents).all();
  const total = rows.length;
  const counts = new Map<string, number>();
  for (const r of rows) {
    const parts = r.domain.split(".");
    const tld = parts[parts.length - 1]?.toLowerCase();
    if (tld && WATCHED_TLDS.includes(tld)) counts.set(tld, (counts.get(tld) ?? 0) + 1);
  }
  const watchedTotal = [...counts.values()].reduce((a, b) => a + b, 0);
  return {
    totalQueries: total,
    watchedTldQueries: watchedTotal,
    share: total > 0 ? watchedTotal / total : 0,
    breakdown: [...counts.entries()].map(([tld, count]) => ({ tld, count })).sort((a, b) => b.count - a.count),
    note: "Trend visibility only — these TLDs are statistically over-represented in abuse, but the large majority of queries to them are legitimate.",
  };
}

// -----------------------------------------------------------------------
// Metric #57 — Punycode / Homograph Domain Detection
//   Flags xn-- (punycode/IDN) domains, a common phishing/homograph-attack
//   vector, without asserting any specific domain is malicious.
// -----------------------------------------------------------------------
export function punycodeDomains(limit = 50) {
  const rows = db.select().from(domains).all();
  const flagged = rows.filter((d) => d.domain.split(".").some((label) => label.startsWith("xn--")));
  return {
    totalDomains: rows.length,
    punycodeDomainCount: flagged.length,
    domains: flagged
      .sort((a, b) => b.queryCount - a.queryCount)
      .slice(0, limit)
      .map((d) => ({ domain: d.domain, queryCount: d.queryCount, firstSeen: d.firstSeen })),
    note: "Flags the encoding, not intent — many legitimate internationalized domains use punycode too.",
  };
}

// -----------------------------------------------------------------------
// Metric #58 — DNS Tunneling Heuristics
//   Candidate signal only: combines high query rate, long query labels, and
//   high character entropy for a single domain. None of these alone (or
//   together) proves tunneling — legitimate CDN/telemetry traffic can look
//   similar. Surfaced as "worth a look", never as a verdict.
// -----------------------------------------------------------------------
export function dnsTunnelingHeuristics(minQueries = 20, minLabelLength = 20, minEntropy = 3.3, limit = 20) {
  const rows = db.select().from(domains).all().filter((d) => d.queryCount >= minQueries);

  const scored = rows.map((d) => {
    const label = d.domain.split(".")[0] ?? d.domain;
    const charCounts = new Map<string, number>();
    for (const ch of label) charCounts.set(ch, (charCounts.get(ch) ?? 0) + 1);
    const entropy = shannonEntropy([...charCounts.values()]);
    return { domain: d.domain, queryCount: d.queryCount, labelLength: label.length, entropy };
  });

  const candidates = scored.filter((s) => s.labelLength >= minLabelLength && s.entropy >= minEntropy);
  return {
    candidates: candidates.sort((a, b) => b.entropy - a.entropy).slice(0, limit),
    note: "Candidate signal only, not a detection verdict — combines query volume, label length, and entropy. Legitimate high-entropy CDN/telemetry subdomains will also appear here.",
  };
}

// -----------------------------------------------------------------------
// Metric #59 — Repeated Failure Burst Detection
//   Clusters of NXDOMAIN/SERVFAIL from the same client within a short
//   window — can indicate malware attempting sequential C2 domain
//   generation, or just a misconfigured device/app retrying a dead domain.
// -----------------------------------------------------------------------
export function repeatedFailureBursts(windowMinutes = 5, minFailuresInWindow = 10) {
  const rows = db
    .select({ clientId: dnsEvents.clientId, timestamp: dnsEvents.timestamp, responseCode: dnsEvents.responseCode })
    .from(dnsEvents)
    .all()
    .filter((r) => r.clientId && (r.responseCode === "NXDOMAIN" || r.responseCode === "SERVFAIL"))
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

  const byClient = new Map<string, string[]>();
  for (const r of rows) {
    if (!byClient.has(r.clientId!)) byClient.set(r.clientId!, []);
    byClient.get(r.clientId!)!.push(r.timestamp);
  }

  const windowMs = windowMinutes * 60_000;
  const bursts: { clientId: string; burstStart: string; burstEnd: string; failureCount: number }[] = [];

  for (const [clientId, timestamps] of byClient.entries()) {
    let windowStart = 0;
    for (let i = 0; i < timestamps.length; i++) {
      while (new Date(timestamps[i]).getTime() - new Date(timestamps[windowStart]).getTime() > windowMs) {
        windowStart++;
      }
      const countInWindow = i - windowStart + 1;
      if (countInWindow >= minFailuresInWindow) {
        bursts.push({ clientId, burstStart: timestamps[windowStart], burstEnd: timestamps[i], failureCount: countInWindow });
        break; // one flagged burst per client is enough signal; avoid overlapping duplicate windows
      }
    }
  }

  return { windowMinutes, minFailuresInWindow, bursts, note: "Candidate signal, not a verdict — legitimate retry storms (e.g. a misconfigured app) can also trigger this." };
}

// -----------------------------------------------------------------------
// Metric #60 — Blocklist Hit Attribution
//   KNOWN SCOPE LIMIT: Technitium's query log doesn't expose which specific
//   blocklist triggered a block via the fields this collector reads (see
//   technitium-client.ts) — attribution here is by netintel's own domain
//   category (#9), not by upstream blocklist name. Revisit if/when
//   per-blocklist attribution is confirmed available from a live instance.
// -----------------------------------------------------------------------
export function blocklistHitAttribution() {
  const blockedEvents = db.select({ domain: dnsEvents.domain }).from(dnsEvents).where(eq(dnsEvents.blocked, true)).all();
  const categoryByDomain = new Map(db.select().from(domainCategories).all().map((c) => [c.domain, c.category]));

  const total = blockedEvents.length;
  const byCategory = new Map<string, number>();
  for (const e of blockedEvents) {
    const category = categoryByDomain.get(e.domain) ?? "uncategorized";
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
  }

  return {
    totalBlocked: total,
    byCategory: [...byCategory.entries()]
      .map(([category, count]) => ({ category, count, share: total > 0 ? count / total : 0 }))
      .sort((a, b) => b.count - a.count),
    note: "Attributed by netintel's domain category, not by upstream blocklist name — see KNOWN SCOPE LIMIT comment.",
  };
}

// -----------------------------------------------------------------------
// Metric #61 — New Device Security Baseline
//   Snapshots a newly-seen device's first-24h query pattern as the initial
//   baseline that #30 (Behavioral Anomaly Detection) will compare later
//   activity against.
// -----------------------------------------------------------------------
export function newDeviceSecurityBaseline(deviceId: string) {
  const device = db.select().from(devices).where(eq(devices.deviceId, deviceId)).get();
  if (!device) return { deviceId, hasBaseline: false, note: "Unknown device." };

  const windowEnd = new Date(new Date(device.firstSeen).getTime() + 24 * 3600_000).toISOString();
  const events = db
    .select()
    .from(dnsEvents)
    .where(and(eq(dnsEvents.clientId, deviceId), gte(dnsEvents.timestamp, device.firstSeen), lte(dnsEvents.timestamp, windowEnd)))
    .all();

  if (events.length === 0) {
    return { deviceId, hasBaseline: false, note: "Device hasn't accumulated 24h of activity yet." };
  }

  const queriesPerHour = events.length / 24;
  const uniqueDomains = new Set(events.map((e) => e.domain)).size;
  const nxRate = events.filter((e) => e.responseCode === "NXDOMAIN").length / events.length;

  return {
    deviceId,
    hasBaseline: true,
    baselineWindow: { from: device.firstSeen, to: windowEnd },
    queriesPerHour,
    uniqueDomains,
    nxRate,
  };
}

// -----------------------------------------------------------------------
// Metric #62 — Alert-to-Incident Correlation
//   Links a fired alert policy back to the underlying security-analytics
//   signals (insights: anomalies, NXDOMAIN spikes, block spikes) recorded
//   near the same timestamp, for post-hoc review of what actually
//   triggered it.
// -----------------------------------------------------------------------
export function alertToIncidentCorrelation(alertEventId: string, windowMinutes = 15) {
  const alert = db.select().from(alertEvents).where(eq(alertEvents.id, alertEventId)).get();
  if (!alert) return { alertEventId, found: false, correlatedInsights: [] };

  const windowMs = windowMinutes * 60_000;
  const alertTime = new Date(alert.timestamp).getTime();
  const allInsights = db.select().from(insights).all();

  const correlated = allInsights.filter((i) => Math.abs(new Date(i.timestamp).getTime() - alertTime) <= windowMs);

  return {
    alertEventId,
    found: true,
    alertTimestamp: alert.timestamp,
    windowMinutes,
    correlatedInsights: correlated.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1)),
  };
}

// -----------------------------------------------------------------------
// Metric #16 — Newly Observed Domains
// -----------------------------------------------------------------------
export function newlyObservedDomains(withinDays = 1, limit = 50) {
  const cutoff = new Date(Date.now() - withinDays * 86_400_000).toISOString();
  const all = db.select().from(domains).all();
  const recent = all.filter((d) => d.firstSeen >= cutoff);
  const oneTime = all.filter((d) => d.queryCount === 1);

  return {
    newDomainCount: recent.length,
    newDomains: recent.sort((a, b) => (a.firstSeen < b.firstSeen ? 1 : -1)).slice(0, limit),
    oneTimeDomainCount: oneTime.length,
  };
}
