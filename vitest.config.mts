import { defineConfig } from "vitest/config";
import { TEST_DB_DIR } from "./test/test-db-path.mjs";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    testTimeout: 15000, // a few tests spin up a real migrated throwaway sqlite DB
    // Several server tests share one real sqlite DB file (see test-db-path.ts)
    // and assert on "latest row" semantics (autoincrement id ordering) —
    // parallel test files writing to the same DB could interleave and make
    // those assertions flaky, so files run sequentially. The suite is small
    // enough that this isn't a meaningful speed cost.
    fileParallelism: false,
    globalSetup: ["./test/global-setup.mts"],
    env: {
      // Set before any test file's top-level imports run, so db/client.ts's
      // module-load-time defaultDbPath() read picks this up correctly.
      NETINTEL_DATA_DIR: TEST_DB_DIR,
    },
  },
});
