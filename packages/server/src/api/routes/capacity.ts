import { Hono } from "hono";
import { forecastQueryVolume, forecastDbSize, forecastDeviceCount, forecastDiskRunout } from "../../capacity/forecast.js";

export const capacityRoute = new Hono();

capacityRoute.get("/query-volume", (c) => c.json(forecastQueryVolume()));
capacityRoute.get("/db-size", (c) => c.json(forecastDbSize()));
capacityRoute.get("/device-count", (c) => c.json(forecastDeviceCount()));
capacityRoute.get("/disk-runout", (c) => c.json(forecastDiskRunout()));
