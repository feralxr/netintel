import chalk from "chalk";
import Table from "cli-table3";
import { apiGet } from "../api-client.js";
import { section, table, noDataNote } from "../output.js";

interface DomainResponse {
  record: { domain: string; firstSeen: string; lastSeen: string; queryCount: number; uniqueDays: number; lifecycleState: string | null };
  category: { category: string; confidence: number; source: string } | null;
  dailyHistory: { date: string; queries: number; cacheHits: number; blocked: number; nxdomain: number }[];
  recentQueries: { timestamp: string; clientIp: string; responseCode: string; cached: boolean; blocked: boolean }[];
}
interface ResponseCodeDist {
  total: number;
  breakdown: { responseCode: string; count: number; share: number }[];
}
interface Burstiness {
  fanoFactor: number | null;
  sampleSize: number;
  note: string | null;
}
interface Fragmentation {
  distinctSubdomainCount: number;
  subdomains: string[];
}

export async function domainCommand(domain: string): Promise<void> {
  const [data, responseCodes, burstiness, fragmentation] = await Promise.all([
    apiGet<DomainResponse>(`/api/domains/${encodeURIComponent(domain)}`),
    apiGet<ResponseCodeDist>(`/api/domains/${encodeURIComponent(domain)}/response-codes`), // #51
    apiGet<Burstiness>(`/api/domains/${encodeURIComponent(domain)}/burstiness`), // #53
    apiGet<Fragmentation>(`/api/domains/${encodeURIComponent(domain)}/fragmentation`), // #54
  ]);
  const { record, category, dailyHistory, recentQueries } = data;

  console.log(chalk.bold(`\n${record.domain}\n`));
  console.log(`  Total queries      ${chalk.cyan(record.queryCount)}`);
  console.log(`  Unique days active ${record.uniqueDays}`);
  console.log(`  First seen         ${new Date(record.firstSeen).toLocaleString()}`);
  console.log(`  Last seen          ${new Date(record.lastSeen).toLocaleString()}`);
  console.log(`  Lifecycle state    ${record.lifecycleState ?? chalk.dim("not yet classified")}`);
  console.log(
    `  Category           ${category ? `${category.category} (${category.source}, confidence ${category.confidence})` : chalk.dim("uncategorized")}`
  );

  if (dailyHistory.length > 0) {
    console.log(chalk.bold("\n  Daily history\n"));
    const table = new Table({ head: ["Date", "Queries", "Cache hits", "Blocked", "NXDOMAIN"] });
    for (const d of dailyHistory.slice(0, 14)) {
      table.push([d.date, d.queries, d.cacheHits, d.blocked, d.nxdomain]);
    }
    console.log(table.toString());
  }

  if (recentQueries.length > 0) {
    console.log(chalk.bold("\n  Recent queries\n"));
    const table2 = new Table({ head: ["Time", "Client", "Result", "Cached", "Blocked"] });
    for (const q of recentQueries.slice(0, 10)) {
      table2.push([
        new Date(q.timestamp).toLocaleTimeString(),
        q.clientIp,
        q.responseCode,
        q.cached ? "yes" : "no",
        q.blocked ? "yes" : "no",
      ]);
    }
    console.log(table2.toString());
  }

  section("Response code distribution");
  table(responseCodes.breakdown, [
    { key: "responseCode", label: "Code" },
    { key: "count", label: "Count" },
    { key: "share", label: "Share", format: (v) => `${((v as number) * 100).toFixed(1)}%` },
  ]);

  section("Query burstiness");
  if (burstiness.fanoFactor !== null) {
    console.log(`  Fano factor: ${chalk.cyan(burstiness.fanoFactor.toFixed(2))} (from ${burstiness.sampleSize} queries)`);
    console.log(chalk.dim("  ~1 = random spacing, >1 = bursty, <1 = unusually regular"));
  } else {
    noDataNote(burstiness.note);
  }

  section("Subdomain fragmentation");
  console.log(`  ${fragmentation.distinctSubdomainCount} distinct subdomains observed.`);
  console.log();
}
