import { Hono } from "hono";
import {
  queryTypeDistribution,
  ipv4VsIpv6Mix,
  cnameChainDepth,
  reverseDnsQueryVolume,
  malformedRefusedRate,
  dohDotDoqBypassAttempts,
} from "../../analytics/protocol.js";

export const protocolRoute = new Hono();

protocolRoute.get("/query-types", (c) => c.json(queryTypeDistribution(c.req.query("domain")))); // #85
protocolRoute.get("/ip-version-mix", (c) => c.json(ipv4VsIpv6Mix())); // #86
protocolRoute.get("/cname-depth", (c) => c.json(cnameChainDepth())); // #87
protocolRoute.get("/ptr-volume", (c) => c.json(reverseDnsQueryVolume())); // #88
protocolRoute.get("/malformed-refused", (c) => c.json(malformedRefusedRate())); // #89
protocolRoute.get("/doh-bypass", (c) => c.json(dohDotDoqBypassAttempts())); // #90
