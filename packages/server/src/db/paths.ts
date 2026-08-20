import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// v1 targets Windows 10/11 and Linux only (no macOS-specific paths needed).
export function defaultDataDir(): string {
  if (process.env.NETINTEL_DATA_DIR) return process.env.NETINTEL_DATA_DIR;

  const platform = os.platform();
  if (platform === "win32") {
    const base = process.env.PROGRAMDATA ?? "C:\\ProgramData";
    return path.join(base, "netintel");
  }
  // linux
  if (process.getuid && process.getuid() === 0) {
    return "/var/lib/netintel";
  }
  return path.join(os.homedir(), ".local", "share", "netintel");
}

export function defaultDbPath(): string {
  return process.env.NETINTEL_DB_PATH ?? path.join(defaultDataDir(), "netintel.db");
}

export function ensureDataDir(dbPath: string): void {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
}
