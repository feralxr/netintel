import "dotenv/config"; // must be first — loads .env before client.ts reads NETINTEL_DATA_DIR/NETINTEL_DB_PATH
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, dbPath } from "./client.js";

console.log(`[netintel] running migrations against ${dbPath}`);
migrate(db, { migrationsFolder: "./drizzle" });
console.log("[netintel] migrations complete");
