import { Prisma, PrismaClient } from "@/generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";

// DATABASE_SCHEMA is set only by the integration test config (see
// vitest.integration.config.ts) to point this same client at the isolated
// `test_isolation` schema instead of `public`. The Neon runtime adapter needs
// the schema passed as an explicit option — unlike the Prisma CLI, it does not
// honour a `?schema=` query parameter in the connection string.
const createClient = () =>
  new PrismaClient({
    adapter: new PrismaNeon(
      { connectionString: process.env.DATABASE_URL! },
      process.env.DATABASE_SCHEMA ? { schema: process.env.DATABASE_SCHEMA } : undefined,
    ),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * The Neon adapter's `schema` option (above) only affects SQL the fluent
 * client generates itself — hand-written raw SQL is not rewritten, and an
 * unqualified table name resolves against the connection's default
 * `search_path` (`public`), regardless of `DATABASE_SCHEMA`. This is not
 * user input — it is one of two fixed, internally-controlled values — so
 * interpolating it directly into raw SQL is safe.
 */
export const dbSchema = process.env.DATABASE_SCHEMA ?? "public";

/**
 * Schema-qualified table identifier for use inside a `$queryRaw`/`$executeRaw`
 * tagged template that has *no other* bound parameters (e.g. `TRUNCATE`).
 *
 * Do NOT use this in a query that also binds parameters (e.g. a `WHERE id =
 * ${id}`) — mixing a `Prisma.raw()` fragment with bound parameters in the
 * same tagged template corrupts the driver's positional `$1`/`$2` numbering
 * with the Neon adapter (confirmed: "syntax error at or near \"$1\""). For
 * that case use `$queryRawUnsafe`/`$executeRawUnsafe` with the schema
 * interpolated directly into the SQL string and real values passed as
 * `$1`, `$2`, ... arguments instead — see `recordPayment` in
 * payment-service.ts.
 */
export function dbTable(name: string) {
  return Prisma.raw(`"${dbSchema}"."${name}"`);
}
