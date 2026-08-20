import fs from "node:fs";
import chalk from "chalk";
import { BASE_URL } from "../api-client.js";

export async function exportCommand(opts: { level: string; format: string; out?: string }): Promise<void> {
  const url = `${BASE_URL}/api/export?level=${opts.level}&format=${opts.format}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(chalk.red(`Export failed: ${res.status} ${await res.text()}`));
    process.exitCode = 1;
    return;
  }
  const outPath = opts.out ?? `netintel-export-level${opts.level}.${opts.format}`;

  if (opts.format === "sqlite" || opts.format === "parquet" || opts.format === "pdf") {
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outPath, buffer);
  } else {
    const body = await res.text();
    fs.writeFileSync(outPath, body);
  }
  console.log(chalk.green(`\nExported level ${opts.level} (${opts.format}) -> ${outPath}\n`));
}
