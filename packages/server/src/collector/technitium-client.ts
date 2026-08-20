// Thin client over Technitium DNS Server's HTTP API.
//
// NOTE: Technitium's API surface differs slightly across versions. Endpoints
// below match the commonly documented v13+ API (confirm against your
// instance's own docs at http://<technitium-host>:5380/ -> Help -> API docs
// before wiring this up to production). This client is intentionally the
// single place that talks to Technitium, so any version drift is a one-file fix.

export interface TechnitiumConfig {
  baseUrl: string; // e.g. http://192.168.1.10:5380
  apiToken: string; // generated in Technitium: Administration -> Sessions -> Create API Token
}

export interface RawQueryLogEntry {
  rowNumber: number;
  timestamp: string;
  clientIpAddress: string;
  protocol: string; // Udp | Tcp | Tls | Https | Quic
  responseType: string; // Authoritative | Recursive | Cached | Blocked | ...
  rcode: string; // NoError | NxDomain | ServFail | Refused
  qname: string;
  qtype: string;
  qclass: string;
  answer: string | null;
  // responseRtt IS present on the real /api/logs/query response (confirmed
  // against a live v13+ instance running the Query Logs (Sqlite) app) —
  // milliseconds, only populated for Recursive lookups (absent/null for
  // Cached/Blocked/Authoritative since there's no upstream round trip).
  // The class comment above and the README's "Known v1 limitation" note
  // about missing per-query latency were wrong; corrected during live testing.
  responseRtt?: number | null;
  answerTtl?: number;
  upstream?: string;
}

export interface DhcpLease {
  hardwareAddress: string; // MAC
  clientIdentifier: string | null;
  ipAddress: string;
  hostName: string | null;
  leaseObtained: string;
  leaseExpires: string;
}

export class TechnitiumClient {
  constructor(private readonly config: TechnitiumConfig) {}

  private url(path: string, params: Record<string, string> = {}): string {
    const u = new URL(path, this.config.baseUrl);
    u.searchParams.set("token", this.config.apiToken);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  }

  /** All requests get a hard timeout — an unreachable Technitium instance should fail fast and loudly, never hang silently. */
  private async fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await this.fetchWithTimeout(this.url("/api/user/session/get"), 5000);
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Pulls query log entries. Technitium's built-in "Query Logs (Sqlite)" app
   * exposes /api/logs/query with pageNumber/entriesPerPage paging.
   * The collector polls this on an interval and tracks the last rowNumber seen.
   */
  async queryLogs(opts: { pageNumber?: number; entriesPerPage?: number } = {}): Promise<RawQueryLogEntry[]> {
    const res = await this.fetchWithTimeout(
      this.url("/api/logs/query", {
        name: "Query Logs (Sqlite)",
        classPath: "QueryLogsSqlite.App",
        pageNumber: String(opts.pageNumber ?? 1),
        entriesPerPage: String(opts.entriesPerPage ?? 500),
        descendingOrder: "true",
      })
    );
    if (!res.ok) throw new Error(`Technitium queryLogs failed: ${res.status}`);
    const json = (await res.json()) as { response?: { entries?: RawQueryLogEntry[] } };
    return json.response?.entries ?? [];
  }

  async dhcpLeases(): Promise<DhcpLease[]> {
    const res = await this.fetchWithTimeout(this.url("/api/dhcp/leases/list"));
    if (!res.ok) throw new Error(`Technitium dhcpLeases failed: ${res.status}`);
    const json = (await res.json()) as { response?: { leases?: DhcpLease[] } };
    return json.response?.leases ?? [];
  }
}