import { Hono } from "hono";
import { getHostHealth } from "../../infrastructure/health.js";
import { hostResourceUtilization, processUptimeAndRestartHistory, collectorHealthTimeline } from "../../analytics/infrastructure-metrics.js";

export const infrastructureRoute = new Hono();

infrastructureRoute.get("/health", (c) => c.json(getHostHealth()));

infrastructureRoute.get("/host-utilization", (c) => c.json(hostResourceUtilization(Number(c.req.query("limit") ?? 500)))); // #98
infrastructureRoute.get("/restarts", (c) => c.json(processUptimeAndRestartHistory(Number(c.req.query("limit") ?? 50)))); // #99
infrastructureRoute.get("/collector-health", (c) => c.json(collectorHealthTimeline(Number(c.req.query("limit") ?? 500)))); // #100
