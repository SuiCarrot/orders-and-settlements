import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Used only to run `prisma migrate deploy` against the `test_isolation` schema
// inside the same Neon database that development uses. See
// docs/implementation/02-database.md and scripts/setup-test-schema.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("TEST_DIRECT_URL"),
  },
});
