import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { defaultDbPath, ensureDataDir } from "./paths.js";

const dbPath = defaultDbPath();
ensureDataDir(dbPath);

const sqlite = new Database(dbPath);

// WAL mode: readers (API/dashboard) don't block the collector's writes.
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export const rawSqlite: Database.Database = sqlite;
export { dbPath };
