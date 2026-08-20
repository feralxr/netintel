import chalk from "chalk";
import Table from "cli-table3";
import { apiGet } from "../api-client.js";

interface DomainResponse {
  record: { domain: string; firstSeen: string; lastSeen: string; queryCount: number; uniqueDays: number; lifecycleState: string | null };
  category: { category: string; confidence: number; source: string } | null;
  dailyHistory: { date: string; queries: number; cacheHits: number; blocked: number; nxdomain: number }[];
  recentQueries: { timestamp: string; clientIp: string; responseCode: string; cached: boolean; blocked: boolean }[];
}

export async function domainCommand(domain: string): Promise<void> {
  const data = await apiGet<DomainResponse>(`/api/domains/${encodeURIComponent(domain)}`);
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
    const table = new Table({ head: ["Time", "Client", "Result", "Cached", "Blocked"] });
    for (const q of recentQueries.slice(0, 10)) {
      table.push([
        new Date(q.timestamp).toLocaleTimeString(),
        q.clientIp,
        q.responseCode,
        q.cached ? "yes" : "no",
        q.blocked ? "yes" : "no",
      ]);
    }
    console.log(table.toString());
  }
  console.log();
}
