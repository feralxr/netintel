import path from "node:path";
import os from "node:os";

// A single fixed throwaway DB shared across the whole vitest run — real
// migrated schema via the actual drizzle migrator (see global-setup.ts),
// not a hand-rolled test schema, so tests exercise the same DB shape
// production code does. Tests that need isolation from each other use
// unique domain names / MACs / timestamps per test rather than separate
// DB files, since spinning up + migrating a fresh sqlite file per test
// would be far slower for no real benefit here.
export const TEST_DB_DIR = path.join(os.tmpdir(), "netintel-vitest-db");
