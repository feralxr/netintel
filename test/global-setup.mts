import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_DB_DIR } from "./test-db-path.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(__dirname, "..", "packages", "server");

export default async function globalSetup() {
  fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });

  // Runs the real drizzle migrator (same one production boots run) as a
  // child process, so the test DB has the exact real schema — not a
  // hand-maintained copy that could silently drift from packages/server's
  // actual migrations.
  execFileSync("npx", ["tsx", "src/db/migrate.ts"], {
    cwd: serverDir,
    env: { ...process.env, NETINTEL_DATA_DIR: TEST_DB_DIR },
    stdio: "inherit",
  });
}
