#!/usr/bin/env node
// Regenerates docs/METRICS.md from packages/shared/src/metrics-registry.ts.
// Run via `npm run docs:metrics` from the repo root whenever the registry
// changes — or as a pre-commit/CI check to catch a stale doc (see the
// --check flag below).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { METRICS } from "../dist/metrics-registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "..", "..", "..", "docs", "METRICS.md");

const GROUP_ORDER = ["domain", "security", "performance", "device", "trends", "behavioral", "reporting", "protocol", "dhcp", "capacity", "infrastructure"];
const GROUP_TITLES = {
  domain: "Domain",
  security: "Security",
  performance: "Performance",
  device: "Device",
  trends: "Trends",
  behavioral: "Behavioral",
  reporting: "Reporting",
  protocol: "Protocol",
  dhcp: "DHCP",
  capacity: "Capacity",
  infrastructure: "Infrastructure",
};

function generate() {
  let out = "# netintel — Metrics Reference\n\n";
  out += `All ${METRICS.length} metrics netintel computes, grouped exactly as they appear in the CLI (\`netintel explain\`) and web dashboard. `;
  out += "This file is generated directly from `packages/shared/src/metrics-registry.ts` — the single source of truth every layer ";
  out += "(analytics functions, API routes, web tooltips, CLI `explain`) reads from, so it can never drift out of sync with what the product actually computes.\n\n";
  out += "For any metric: `netintel explain <id>` in the CLI, or hover the (i) icon next to it in the web dashboard, shows the same description shown here.\n\n";
  out += "Regenerate this file with `npm run docs:metrics` after any registry change — don't hand-edit it.\n\n";
  out += "## Groups\n\n";
  for (const g of GROUP_ORDER) {
    const items = METRICS.filter((m) => m.group === g);
    out += `- [${GROUP_TITLES[g]}](#${GROUP_TITLES[g].toLowerCase()}) (${items.length})\n`;
  }
  out += "\n---\n\n";

  for (const g of GROUP_ORDER) {
    const items = METRICS.filter((m) => m.group === g).sort((a, b) => a.number - b.number);
    out += `## ${GROUP_TITLES[g]}\n\n`;
    for (const m of items) {
      out += `### #${m.number} — ${m.name}\n\n`;
      out += `${m.description}\n\n`;
      if (m.formula) out += `\`\`\`\n${m.formula}\n\`\`\`\n\n`;
      out += `\`id: ${m.id}\`\n\n`;
    }
    out += "---\n\n";
  }

  return out;
}

const generated = generate();

if (process.argv.includes("--check")) {
  const existing = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, "utf-8") : "";
  if (existing !== generated) {
    console.error("docs/METRICS.md is stale — run `npm run docs:metrics` and commit the result.");
    process.exit(1);
  }
  console.log("docs/METRICS.md is up to date.");
} else {
  fs.writeFileSync(OUT_PATH, generated);
  console.log(`docs/METRICS.md regenerated (${METRICS.length} metrics).`);
}
