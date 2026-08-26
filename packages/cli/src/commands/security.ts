import chalk from "chalk";
import { apiGet } from "../api-client.js";
import { section, table, stat, noDataNote } from "../output.js";
import { renderBarChart } from "../charts/bar.js";
import { isJsonMode } from "../config.js";

interface NxdomainAnalysis {
  totalQueries: number;
  nxdomainCount: number;
  nxRate: number;
  topNxDomains: { domain: string; count: number }[];
}
interface EntropyEntry {
  domain: string;
  entropy: number;
  queryCount: number;
}
interface NewDomains {
  newDomainCount: number;
  oneTimeDomainCount: number;
}
interface BaselineResponse {
  hasBaseline: boolean;
  note: string | null;
  streams: Record<string, { baselineMean: number; baselineStddev: number; currentValue: number; zScore: number; deviating: boolean }> | null;
}
interface SuspiciousTld {
  totalQueries: number;
  watchedTldQueries: number;
  share: number;
  breakdown: { tld: string; count: number }[];
}
interface PunycodeDomains {
  punycodeDomainCount: number;
  domains: { domain: string; queryCount: number }[];
}
interface TunnelingResponse {
  candidates: { domain: string; queryCount: number; labelLength: number; entropy: number }[];
  note: string;
}
interface FailureBurstsResponse {
  bursts: { clientId: string; burstStart: string; burstEnd: string; failureCount: number }[];
}
interface BlocklistAttribution {
  totalBlocked: number;
  byCategory: { category: string; count: number; share: number }[];
}

export async function securityCommand(): Promise<void> {
  const [nxdomain, entropy, newDomains, baseline, suspiciousTlds, punycode, tunneling, failureBursts, blocklist] = await Promise.all([
    apiGet<NxdomainAnalysis>("/api/security/nxdomain"), // #14
    apiGet<EntropyEntry[]>("/api/security/entropy"), // #15
    apiGet<NewDomains>("/api/security/new-domains"), // #16
    apiGet<BaselineResponse>("/api/security/baseline"), // #30
    apiGet<SuspiciousTld>("/api/security/suspicious-tlds"), // #56
    apiGet<PunycodeDomains>("/api/security/punycode"), // #57
    apiGet<TunnelingResponse>("/api/security/tunneling"), // #58
    apiGet<FailureBurstsResponse>("/api/security/failure-bursts"), // #59
    apiGet<BlocklistAttribution>("/api/security/blocklist-attribution"), // #60
  ]);

  if (isJsonMode()) {
    console.log(JSON.stringify({ nxdomain, entropy, newDomains, baseline, suspiciousTlds, punycode, tunneling, failureBursts, blocklist }, null, 2));
    return;
  }

  console.log(chalk.bold("\nSecurity overview\n"));
  stat("NXDOMAIN rate", `${(nxdomain.nxRate * 100).toFixed(2)}%`);
  stat("New domains (24h)", newDomains.newDomainCount);
  stat("Suspicious TLD share", `${(suspiciousTlds.share * 100).toFixed(2)}%`);
  stat("Punycode domains", punycode.punycodeDomainCount);
  stat("Blocked (attributed)", blocklist.totalBlocked);

  section("Top NXDOMAIN sources");
  console.log(renderBarChart(nxdomain.topNxDomains.slice(0, 10).map((d) => ({ label: d.domain, value: d.count })), { color: chalk.red }));

  section("High-entropy domains (candidate signal, not proof)");
  table(entropy.slice(0, 10), [
    { key: "domain", label: "Domain" },
    { key: "entropy", label: "Entropy" },
    { key: "queryCount", label: "Queries" },
  ]);

  section("Behavioral baseline z-scores");
  if (baseline.hasBaseline && baseline.streams) {
    table(
      Object.entries(baseline.streams).map(([stream, s]) => ({ stream, zScore: s.zScore, deviating: s.deviating })),
      [
        { key: "stream", label: "Stream" },
        { key: "zScore", label: "Z-score" },
        { key: "deviating", label: "Deviating" },
      ]
    );
  } else {
    noDataNote(baseline.note);
  }

  section("Suspicious TLD exposure (trend only)");
  console.log(renderBarChart(suspiciousTlds.breakdown.slice(0, 10).map((b) => ({ label: `.${b.tld}`, value: b.count })), { color: chalk.yellow }));

  section("Blocklist hit attribution");
  console.log(renderBarChart(blocklist.byCategory.slice(0, 10).map((b) => ({ label: b.category, value: b.count })), { color: chalk.red }));

  section("DNS tunneling heuristics (candidate signal, not a verdict)");
  table(
    tunneling.candidates.slice(0, 10).map((c) => ({ domain: c.domain, entropy: c.entropy, labelLength: c.labelLength })),
    [
      { key: "domain", label: "Domain" },
      { key: "entropy", label: "Entropy" },
      { key: "labelLength", label: "Label length" },
    ]
  );

  section("Repeated failure bursts");
  table(
    failureBursts.bursts.slice(0, 10).map((b) => ({ clientId: b.clientId, failureCount: b.failureCount, burstStart: new Date(b.burstStart).toLocaleString() })),
    [
      { key: "clientId", label: "Client" },
      { key: "failureCount", label: "Failures" },
      { key: "burstStart", label: "Burst start" },
    ]
  );

  console.log();
}
