import "dotenv/config";
import { PrismaClient } from "@/generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";

/**
 * One-off bootstrap for the integration test database.
 *
 * Integration tests run against the same Neon database as development, but
 * under a dedicated Postgres schema (`test_isolation`) so truncating tables
 * between tests can never touch seeded or demo data. See
 * docs/implementation/02-database.md for why this replaces the originally
 * planned separate Neon branch.
 *
 * Usage: npx tsx scripts/setup-test-schema.ts
 */
async function main() {
  const connectionString = process.env.TEST_DIRECT_URL;
  if (!connectionString) {
    throw new Error("TEST_DIRECT_URL is not set. Check your .env file.");
  }

  // The "schema" query parameter in TEST_DIRECT_URL is honoured by the Prisma
  // CLI (migrate) but not by the PrismaNeon runtime adapter, which needs the
  // schema passed as an explicit constructor option instead.
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }, { schema: "test_isolation" }),
  });

  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS test_isolation`);
  console.log("test_isolation schema is ready.");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
