import { Hono } from "hono";
import { detectApplication, searchVsDirectNavigation, backgroundVsInteractive, mostPeriodicDomains, internetRoutine } from "../../analytics/behavioral.js";
import { domainCorrelations, domainClusters, predictNextDomains, relationshipGraph } from "../../analytics/relationships.js";

export const behavioralRoute = new Hono();

behavioralRoute.get("/application/:domain", (c) => c.json(detectApplication(c.req.param("domain")))); // #38
behavioralRoute.get("/search-vs-direct", (c) => c.json(searchVsDirectNavigation())); // #39
behavioralRoute.get("/background-vs-interactive", (c) => c.json(backgroundVsInteractive())); // #40
behavioralRoute.get("/periodicity", (c) => c.json(mostPeriodicDomains())); // #41
behavioralRoute.get("/correlations/:domain", (c) => c.json(domainCorrelations(c.req.param("domain")))); // #42
behavioralRoute.get("/clusters", (c) => c.json(domainClusters())); // #43
behavioralRoute.get("/graph", (c) => c.json(relationshipGraph())); // v2 Relationship Map
behavioralRoute.get("/predict/:domain", (c) => c.json(predictNextDomains(c.req.param("domain")))); // #44/#45
behavioralRoute.get("/routine", (c) => c.json(internetRoutine())); // #46
