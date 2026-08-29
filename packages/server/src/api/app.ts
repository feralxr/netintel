import { Hono } from "hono";
import { cors } from "hono/cors";
import { statusRoute } from "./routes/status.js";
import { devicesRoute } from "./routes/devices.js";
import { domainsRoute } from "./routes/domains.js";
import { metricsRoute } from "./routes/metrics.js";
import { notificationsRoute } from "./routes/notifications.js";
import { exportRoute } from "./routes/export.js";
import { securityRoute } from "./routes/security.js";
import { performanceRoute } from "./routes/performance.js";
import { analyticsRoute } from "./routes/analytics.js";
import { behavioralRoute } from "./routes/behavioral.js";
import { explorerRoute } from "./routes/explorer.js";
import { dashboardsRoute } from "./routes/dashboards.js";
import { alertsRoute } from "./routes/alerts.js";
import { syntheticsRoute } from "./routes/synthetics.js";
import { insightsRoute } from "./routes/insights.js";
import { capacityRoute } from "./routes/capacity.js";
import { searchRoute } from "./routes/search.js";
import { infrastructureRoute } from "./routes/infrastructure.js";
import { reportsRoute } from "./routes/reports.js";
import { protocolRoute } from "./routes/protocol.js";
import { dhcpRoute } from "./routes/dhcp.js";
import { mountWebDashboard } from "./static-site.js";

export const app = new Hono();

app.use("*", cors());

app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/api/status", statusRoute);
app.route("/api/devices", devicesRoute);
app.route("/api/domains", domainsRoute);
app.route("/api/metrics", metricsRoute);
app.route("/api/notifications", notificationsRoute);
app.route("/api/export", exportRoute);
app.route("/api/security", securityRoute);
app.route("/api/performance", performanceRoute);
app.route("/api/analytics", analyticsRoute);
app.route("/api/behavioral", behavioralRoute);
app.route("/api/explorer", explorerRoute);
app.route("/api/dashboards", dashboardsRoute);
app.route("/api/alerts", alertsRoute);
app.route("/api/synthetics", syntheticsRoute);
app.route("/api/insights", insightsRoute);
app.route("/api/capacity", capacityRoute);
app.route("/api/search", searchRoute);
app.route("/api/infrastructure", infrastructureRoute);
app.route("/api/reports", reportsRoute);
app.route("/api/protocol", protocolRoute);
app.route("/api/dhcp", dhcpRoute);

// Serves the built web dashboard directly, so no separate static file
// server/reverse proxy is needed for the common case — mounted last so it
// can never shadow an /api/* route. Logged from index.ts at boot so it's
// obvious in the console whether this actually took effect.
export const webDashboard = mountWebDashboard(app);
