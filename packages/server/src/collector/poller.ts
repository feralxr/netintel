import { TechnitiumClient, type TechnitiumConfig } from "./technitium-client.js";
import { ingestQueryLogEntry } from "./ingest.js";
import { syncFromDhcpLeases } from "./identity.js";
import { setTechnitiumHealth } from "./health.js";

export interface PollerOptions extends TechnitiumConfig {
  queryLogIntervalMs?: number;
  dhcpSyncIntervalMs?: number;
  connectRetryMs?: number;
}

export class Poller {
  private client: TechnitiumClient;
  private lastRowNumber = 0;
  private queryTimer?: NodeJS.Timeout;
  private dhcpTimer?: NodeJS.Timeout;
  private connectRetryTimer?: NodeJS.Timeout;
  running = false;
  connected = false;

  constructor(private opts: PollerOptions) {
    this.client = new TechnitiumClient(opts);
  }

  /**
   * Never throws — a Technitium instance being briefly unreachable (restart,
   * network hiccup) should not take down the whole netintel process. The API
   * server and dashboard stay up and usable against existing historical data
   * regardless; this just means live collection is paused until reconnected.
   */
  async start(): Promise<void> {
    this.running = true;
    await this.attemptConnect();
  }

  private async attemptConnect(): Promise<void> {
    const ok = await this.client.testConnection();
    if (!ok) {
      setTechnitiumHealth(false, "cannot reach Technitium — will keep retrying in the background");
      console.error(
        `[collector] cannot reach Technitium at ${this.opts.baseUrl} — dashboard/API stay up, ` +
          `retrying connection every ${(this.opts.connectRetryMs ?? 15000) / 1000}s`
      );
      this.connectRetryTimer = setTimeout(() => void this.attemptConnect(), this.opts.connectRetryMs ?? 15000);
      return;
    }

    setTechnitiumHealth(true);
    this.connected = true;
    console.log(`[collector] connected to Technitium at ${this.opts.baseUrl}`);
    this.startPolling();
  }

  private startPolling(): void {
    const pollQueryLogs = async () => {
      try {
        const entries = await this.client.queryLogs({ entriesPerPage: 500 });
        // Technitium returns newest-first; ingest oldest-first so rollups build in order.
        const newEntries = entries.filter((e) => e.rowNumber > this.lastRowNumber).reverse();
        for (const entry of newEntries) {
          ingestQueryLogEntry(entry);
          if (entry.rowNumber > this.lastRowNumber) this.lastRowNumber = entry.rowNumber;
        }
        setTechnitiumHealth(true);
      } catch (err) {
        console.error("[collector] query log poll failed:", err);
        setTechnitiumHealth(false, (err as Error).message);
      }
    };

    const pollDhcp = async () => {
      try {
        const leases = await this.client.dhcpLeases();
        syncFromDhcpLeases(leases);
        setTechnitiumHealth(true);
      } catch (err) {
        console.error("[collector] dhcp lease poll failed:", err);
        setTechnitiumHealth(false, (err as Error).message);
      }
    };

    void pollQueryLogs();
    void pollDhcp();

    this.queryTimer = setInterval(pollQueryLogs, this.opts.queryLogIntervalMs ?? 5000);
    this.dhcpTimer = setInterval(pollDhcp, this.opts.dhcpSyncIntervalMs ?? 30000);
  }

  stop(): void {
    this.running = false;
    if (this.queryTimer) clearInterval(this.queryTimer);
    if (this.dhcpTimer) clearInterval(this.dhcpTimer);
    if (this.connectRetryTimer) clearTimeout(this.connectRetryTimer);
  }
}
