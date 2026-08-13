import "dotenv/config";
import { defineConfig } from "vitest/config";

// Separate from vitest.config.ts because these tests need `DATABASE_URL` and
// `DATABASE_SCHEMA` pointed at the isolated `test_isolation` schema *before*
// any test file (or the modules it imports, like the Prisma singleton) loads.
// Vitest applies `test.env` before that happens; a setupFiles side effect
// would run too late, since ESM import statements are hoisted above it.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      DATABASE_SCHEMA: "test_isolation",
    },
    setupFiles: ["tests/integration/setup.ts"],
    // The concurrency test needs real parallel requests within a single test,
    // but different test files share the same tables, so files themselves
    // must not run concurrently against each other.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
