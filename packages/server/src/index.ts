import "dotenv/config"; // must be first — loads .env before anything below reads process.env
import { serve } from "@hono/node-server";
import { app } from "./api/app.js";
import { attachWebSocket } from "./api/ws.js";
import { Poller } from "./collector/poller.js";
import { startAnalyticsScheduler } from "./analytics/scheduler.js";
import { reloadSyntheticsScheduler } from "./synthetics/scheduler.js";
import { startHostHealthSampler } from "./infrastructure/sampler.js";
import { recordServerStart, recordServerStop } from "./infrastructure/restarts.js";

const PORT = Number(process.env.NETINTEL_PORT ?? 8787);

async function main() {
  const baseUrl = process.env.NETINTEL_TECHNITIUM_URL;
  const apiToken = process.env.NETINTEL_TECHNITIUM_TOKEN;
  if (!baseUrl || !apiToken) {
    console.error(
      "[netintel] NETINTEL_TECHNITIUM_URL and NETINTEL_TECHNITIUM_TOKEN are required. " +
        "netintel only ever runs against a real Technitium instance — see docs/SETUP.md."
    );
    process.exit(1);
  }

  const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`[netintel] api listening on http://localhost:${info.port}`);
  });

  recordServerStart(); // #99 — logged as soon as we're actually up, before the shutdown handler can fire

  // @hono/node-server's return value wraps a plain node http.Server.
  attachWebSocket(server as unknown as import("node:http").Server);
  startAnalyticsScheduler();
  startHostHealthSampler(); // #98/#100 — persisted host+collector health history
  reloadSyntheticsScheduler(); // loads any synthetic tests already saved in the DB from a previous run

  // Deliberately NOT awaited to block startup, and never throws (see
  // poller.ts) — if Technitium is briefly unreachable, the dashboard/API
  // stay up against existing historical data and the poller quietly retries
  // in the background rather than taking the whole process down with it.
  const poller = new Poller({ baseUrl, apiToken });
  void poller.start();
  console.log(`[netintel] collector connecting to Technitium at ${baseUrl}...`);

  // Records a clean-shutdown row for #99 so restart history can distinguish
  // an intentional stop (service restart, `ctrl+c`) from a crash — a prior
  // row still missing ended_at at next boot is inferred as unclean.
  const shutdown = (signal: string) => {
    console.log(`[netintel] received ${signal}, shutting down...`);
    recordServerStop();
    server.close(() => process.exit(0));
    // Force-exit if close() hangs (e.g. a lingering keep-alive connection).
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[netintel] fatal startup error:", err);
  process.exit(1);
});
