import { Hono } from "hono";
import { buildExportPayload, serialize, rawDatabaseCopy, buildParquetBuffer, buildPdfBuffer } from "../../export/exporter.js";
import type { ExportPrivacyLevel, ExportFormat } from "@netintel/shared";

export const exportRoute = new Hono();

exportRoute.get("/", async (c) => {
  const level = Number(c.req.query("level") ?? 1) as ExportPrivacyLevel;
  const format = (c.req.query("format") ?? "json") as ExportFormat;

  if (![1, 2, 3, 4].includes(level)) return c.json({ error: "level must be 1-4" }, 400);

  if (format === "sqlite") {
    if (level !== 1) {
      return c.json({ error: "sqlite export is a raw database copy and is only available at level 1 (full)" }, 400);
    }
    try {
      const buffer = rawDatabaseCopy();
      c.header("Content-Type", "application/vnd.sqlite3");
      c.header("Content-Disposition", 'attachment; filename="netintel-export.db"');
      return c.body(new Uint8Array(buffer));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  }

  if (format === "parquet") {
    try {
      const payload = buildExportPayload(level);
      const buffer = await buildParquetBuffer(payload);
      c.header("Content-Type", "application/octet-stream");
      c.header("Content-Disposition", `attachment; filename="netintel-export-level${level}.parquet"`);
      return c.body(new Uint8Array(buffer));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  }

  if (format === "pdf") {
    try {
      const payload = buildExportPayload(level);
      const buffer = await buildPdfBuffer(payload);
      c.header("Content-Type", "application/pdf");
      c.header("Content-Disposition", `attachment; filename="netintel-export-level${level}.pdf"`);
      return c.body(new Uint8Array(buffer));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  }

  try {
    const payload = buildExportPayload(level);
    const { body, contentType } = serialize(payload, format);
    c.header("Content-Type", contentType);
    c.header("Content-Disposition", `attachment; filename="netintel-export-level${level}.${format}"`);
    return c.body(body);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});
