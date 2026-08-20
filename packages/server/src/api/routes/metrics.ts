import { Hono } from "hono";
import { METRICS, getMetric, getMetricsByGroup, type MetricGroup } from "@netintel/shared";

export const metricsRoute = new Hono();

metricsRoute.get("/", (c) => {
  const group = c.req.query("group") as MetricGroup | undefined;
  return c.json(group ? getMetricsByGroup(group) : METRICS);
});

metricsRoute.get("/:id", (c) => {
  const metric = getMetric(c.req.param("id"));
  if (!metric) return c.json({ error: "unknown metric id" }, 404);
  return c.json(metric);
});
