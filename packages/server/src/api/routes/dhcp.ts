import { Hono } from "hono";
import { leaseChurn, leaseDurationDistribution, ipReuseAndIdentityContinuity, dhcpToDnsActivityGap } from "../../analytics/dhcp-metrics.js";

export const dhcpRoute = new Hono();

dhcpRoute.get("/lease-churn", (c) => c.json(leaseChurn())); // #91
dhcpRoute.get("/lease-duration", (c) => c.json(leaseDurationDistribution())); // #92
dhcpRoute.get("/ip-continuity", (c) => c.json(ipReuseAndIdentityContinuity())); // #93
dhcpRoute.get("/activity-gap", (c) => c.json(dhcpToDnsActivityGap(Number(c.req.query("limit") ?? 20)))); // #94
