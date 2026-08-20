import { Hono } from "hono";
import { getHostHealth } from "../../infrastructure/health.js";

export const infrastructureRoute = new Hono();

infrastructureRoute.get("/health", (c) => c.json(getHostHealth()));
