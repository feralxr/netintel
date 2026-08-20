import { db } from "../db/client.js";
import { dnsEvents, domains } from "../db/schema.js";
import { eq } from "drizzle-orm";
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
