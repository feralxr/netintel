import { db } from "../db/client.js";
import { dnsEvents, domains, domainDaily, devices } from "../db/schema.js";
import { desc } from "drizzle-orm";
import type { ExportPrivacyLevel, ExportFormat } from "@netintel/shared";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { dbPath } from "../db/client.js";
import parquet from "@dsnp/parquetjs";
import PDFDocument from "pdfkit";

function pseudonymize(value: string, salt: string): string {
  return createHash("sha256").update(salt + value).digest("hex").slice(0, 16);
}

/**
 * Builds the export payload for a given privacy tier. See Bible section 9:
 *  1 Full            - exact timestamps, domains, device identifiers, IPs
 *  2 Pseudonymized    - identifiers hashed, IP removed
 *  3 Aggregated       - category-level stats only, no individual domain/device detail
 *  4 Anonymous research - hour/category/query-count/latency/cache-hit-rate only
 */
export function buildExportPayload(level: ExportPrivacyLevel) {
  const salt = createHash("sha256").update(String(Date.now())).digest("hex");

  if (level === 1) {
    return {
      level,
      events: db.select().from(dnsEvents).orderBy(desc(dnsEvents.id)).limit(50_000).all(),
      domains: db.select().from(domains).all(),
      devices: db.select().from(devices).all(),
    };
  }

  if (level === 2) {
    const events = db.select().from(dnsEvents).orderBy(desc(dnsEvents.id)).limit(50_000).all();
    return {
      level,
      events: events.map((e) => ({
        ...e,
        clientId: e.clientId ? pseudonymize(e.clientId, salt) : null,
        clientIp: undefined,
        domain: pseudonymize(e.domain, salt),
        registeredDomain: pseudonymize(e.registeredDomain, salt),
      })),
    };
  }

  if (level === 3) {
    return {
      level,
      domainDaily: db.select().from(domainDaily).all(),
    };
  }

  // level 4 — anonymous research dataset: no domain or device identity at all
  const daily = db.select().from(domainDaily).all();
  const byHourBucket = daily.map((d) => ({
    date: d.date,
    queries: d.queries,
    cacheHits: d.cacheHits,
    blocked: d.blocked,
    nxdomain: d.nxdomain,
    avgLatencyMs: d.avgLatencyMs,
  }));
  return { level, aggregates: byHourBucket };
}

export function serialize(payload: unknown, format: ExportFormat): { body: string; contentType: string } {
  switch (format) {
    case "json":
      return { body: JSON.stringify(payload, null, 2), contentType: "application/json" };
    case "csv":
      return { body: toCsv(payload), contentType: "text/csv" };
    case "md":
      return { body: `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`, contentType: "text/markdown" };
    case "html":
      return { body: renderHtmlReport(payload), contentType: "text/html" };
    // sqlite is handled separately in the export route (it's a raw binary
    // file copy, not a string serialization of `payload`). parquet is also
    // handled separately (async, binary) — see buildParquetBuffer(). pdf
    // is handled separately too (async, binary) — see buildPdfBuffer().
    default:
      throw new Error(`Export format "${format}" is not implemented — use json, csv, md, html, sqlite, parquet, or pdf.`);
  }
}

function renderHtmlReport(payload: unknown): string {
  const json = JSON.stringify(payload, null, 2);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>netintel export</title>
<style>
  body { background: #0a0a0b; color: #e8e6e2; font-family: ui-monospace, monospace; padding: 2rem; }
  h1 { color: #e8622c; font-size: 1.1rem; }
  pre { background: #131316; border: 1px solid #242428; border-radius: 6px; padding: 1rem; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
</style>
</head>
<body>
  <h1>netintel export — generated ${new Date().toISOString()}</h1>
  <pre>${json.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
</body>
</html>`;
}

/** Level 1 only — a raw copy of the SQLite database file itself, WAL-checkpointed first so it's consistent. */
export function rawDatabaseCopy(): Buffer {
  return fs.readFileSync(dbPath);
}

/**
 * Parquet export: writes the same "primary array" toCsv() extracts, with a
 * schema inferred from the first row's JS types (number -> DOUBLE, boolean
 * -> BOOLEAN, everything else -> UTF8, JSON-stringifying nested values).
 * parquetjs writes to a file, not a buffer directly, so this round-trips
 * through a temp file under the OS temp dir and cleans up after itself.
 */
export async function buildParquetBuffer(payload: unknown): Promise<Buffer> {
  const rows = extractPrimaryArray(payload);
  if (rows.length === 0) {
    throw new Error("Nothing to export as parquet — the payload has no row data.");
  }

  const sample = rows[0] as Record<string, unknown>;
  const fields: Record<string, { type: "DOUBLE" | "BOOLEAN" | "UTF8" }> = {};
  for (const [key, value] of Object.entries(sample)) {
    if (typeof value === "number") fields[key] = { type: "DOUBLE" };
    else if (typeof value === "boolean") fields[key] = { type: "BOOLEAN" };
    else fields[key] = { type: "UTF8" };
  }

  const schema = new parquet.ParquetSchema(fields as never);
  const tmpPath = path.join(os.tmpdir(), `netintel-export-${Date.now()}-${Math.random().toString(36).slice(2)}.parquet`);

  const writer = await parquet.ParquetWriter.openFile(schema, tmpPath);
  for (const row of rows as Record<string, unknown>[]) {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(fields)) {
      const v = row[key];
      normalized[key] = fields[key].type === "UTF8" && v !== null && typeof v === "object" ? JSON.stringify(v) : (v ?? (fields[key].type === "UTF8" ? "" : 0));
    }
    await writer.appendRow(normalized);
  }
  await writer.close();

  const buffer = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);
  return buffer;
}

function extractPrimaryArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const arr = Object.values(payload as Record<string, unknown>).find(Array.isArray);
  return (arr as unknown[]) ?? [];
}

/**
 * PDF export: pdfkit generates the PDF directly (no headless browser/
 * Chromium dependency, which matters for a self-hosted tool that needs to
 * run cleanly on both Windows and Linux without extra native deps). Renders
 * a flat key/value + table dump of whatever payload shape it's given,
 * mirroring the html renderer's generality rather than assuming one shape.
 */
export async function buildPdfBuffer(payload: unknown): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc.fontSize(16).fillColor("#e8622c").text("netintel export", { underline: false });
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#666").text(`Generated ${new Date().toISOString()}`);
  doc.moveDown();

  renderPdfValue(doc, payload, 0);

  doc.end();
  return done;
}

function renderPdfValue(doc: PDFKit.PDFDocument, value: unknown, depth: number): void {
  const indent = 10 + depth * 14;
  doc.fontSize(9).fillColor("#111");

  if (Array.isArray(value)) {
    if (value.length === 0) {
      doc.text("(empty)", indent, doc.y);
      return;
    }
    if (typeof value[0] === "object" && value[0] !== null) {
      // Render as a simple table: header row + one line per record.
      const headers = Object.keys(value[0] as Record<string, unknown>);
      doc.font("Helvetica-Bold").text(headers.join("  |  "), indent, doc.y);
      doc.font("Helvetica");
      for (const row of value.slice(0, 200) as Record<string, unknown>[]) {
        const line = headers.map((h) => String(row[h] ?? "")).join("  |  ");
        doc.text(line, indent, doc.y, { width: 500 });
      }
      if (value.length > 200) doc.fillColor("#888").text(`... and ${value.length - 200} more rows`, indent, doc.y);
    } else {
      doc.text(value.join(", "), indent, doc.y);
    }
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      doc.moveDown(0.3);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#333").text(key, indent, doc.y);
      doc.font("Helvetica");
      if (v !== null && typeof v === "object") {
        renderPdfValue(doc, v, depth + 1);
      } else {
        doc.fontSize(9).fillColor("#111").text(String(v), indent + 14, doc.y);
      }
    }
    return;
  }

  doc.text(String(value), indent, doc.y);
}

function toCsv(payload: unknown): string {
  const rows = extractPrimaryArray(payload);
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0] as Record<string, unknown>);
  const lines = [headers.join(",")];
  for (const row of rows as Record<string, unknown>[]) {
    lines.push(headers.map((h) => JSON.stringify(row[h] ?? "")).join(","));
  }
  return lines.join("\n");
}
