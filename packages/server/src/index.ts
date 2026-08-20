import "dotenv/config"; // must be first — loads .env before anything below reads process.env
import { serve } from "@hono/node-server";
import { app } from "./api/app.js";
import { attachWebSocket } from "./api/ws.js";
import { Poller } from "./collector/poller.js";
import { startAnalyticsScheduler } from "./analytics/scheduler.js";
import { reloadSyntheticsScheduler } from "./synthetics/scheduler.js";

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

  // @hono/node-server's return value wraps a plain node http.Server.
  attachWebSocket(server as unknown as import("node:http").Server);
  startAnalyticsScheduler();
  reloadSyntheticsScheduler(); // loads any synthetic tests already saved in the DB from a previous run

  // Deliberately NOT awaited to block startup, and never throws (see
  // poller.ts) — if Technitium is briefly unreachable, the dashboard/API
  // stay up against existing historical data and the poller quietly retries
  // in the background rather than taking the whole process down with it.
  const poller = new Poller({ baseUrl, apiToken });
  void poller.start();
  console.log(`[netintel] collector connecting to Technitium at ${baseUrl}...`);
}

main().catch((err) => {
  console.error("[netintel] fatal startup error:", err);
  process.exit(1);
});
