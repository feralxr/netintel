import chalk from "chalk";
import { apiGet } from "../api-client.js";
import { section, table, stat, noDataNote } from "../output.js";
import { renderBarChart } from "../charts/bar.js";
import { isJsonMode } from "../config.js";

interface QueryTypeDist {
  totalQueries: number;
  breakdown: { queryType: string; count: number; share: number }[];
}
interface Ipv4Ipv6Mix {
  ipv4Share: number;
  ipv6Share: number;
  dualStackClients: number;
  ipv4OnlyClients: number;
}
interface CnameDepth {
  hasData: boolean;
  note: string;
  avgDepth?: number;
  maxDepth?: number;
}
interface PtrVolume {
  ptrQueries: number;
  share: number;
  topClients: { clientId: string; count: number }[];
}
interface MalformedRefused {
  refusedQueries: number;
  rate: number;
  topClients: { clientId: string; count: number }[];
}
interface DohBypass {
  totalAttempts: number;
  recentAttempts: { domain: string; clientId: string | null; timestamp: string }[];
  note: string;
}

export async function protocolCommand(): Promise<void> {
  const [queryTypes, ipMix, cname, ptr, malformed, doh] = await Promise.all([
    apiGet<QueryTypeDist>("/api/protocol/query-types"),
    apiGet<Ipv4Ipv6Mix>("/api/protocol/ip-version-mix"),
    apiGet<CnameDepth>("/api/protocol/cname-depth"),
    apiGet<PtrVolume>("/api/protocol/ptr-volume"),
    apiGet<MalformedRefused>("/api/protocol/malformed-refused"),
    apiGet<DohBypass>("/api/protocol/doh-bypass"),
  ]);

  if (isJsonMode()) {
    console.log(JSON.stringify({ queryTypes, ipMix, cname, ptr, malformed, doh }, null, 2));
    return;
  }

  console.log(chalk.bold("\nProtocol overview\n"));
  stat("IPv4 share", `${(ipMix.ipv4Share * 100).toFixed(1)}%`);
  stat("Dual-stack clients", ipMix.dualStackClients);
  stat("PTR query share", `${(ptr.share * 100).toFixed(2)}%`);
  stat("REFUSED rate", `${(malformed.rate * 100).toFixed(2)}%`);
  stat("DoH/DoT/DoQ bypass attempts", doh.totalAttempts, 30);

  section("Query type distribution");
  console.log(renderBarChart(queryTypes.breakdown.map((b) => ({ label: b.queryType, value: b.count })), { color: chalk.blue }));

  section("CNAME chain depth");
  if (cname.hasData) {
    stat("Avg depth", cname.avgDepth?.toFixed(2) ?? "–");
    stat("Max depth", cname.maxDepth ?? "–");
  }
  noDataNote(cname.note);

  section("Top PTR query clients");
  table(ptr.topClients.slice(0, 10), [
    { key: "clientId", label: "Client" },
    { key: "count", label: "PTR queries" },
  ]);

  section("Top REFUSED clients");
  table(malformed.topClients.slice(0, 10), [
    { key: "clientId", label: "Client" },
    { key: "count", label: "REFUSED queries" },
  ]);

  section("Recent DoH/DoT/DoQ bypass attempts");
  table(
    doh.recentAttempts.slice(0, 10).map((a) => ({ domain: a.domain, clientId: a.clientId ?? "–", timestamp: new Date(a.timestamp).toLocaleString() })),
    [
      { key: "domain", label: "Provider" },
      { key: "clientId", label: "Client" },
      { key: "timestamp", label: "Time" },
    ]
  );
  noDataNote(doh.note);

  console.log();
}
