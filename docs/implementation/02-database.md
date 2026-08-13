# Phase 2 — Database

**Goal.** A Neon Postgres database reachable from the app through Prisma, with the business schema
migrated and the money invariants enforced by the database itself.

**Definition of done.** `npx prisma migrate dev` applies cleanly, and a scratch script can create
an order with line items. Attempting `UPDATE "orders" SET paid_cents = total_cents + 1` in the SQL
editor is rejected by a constraint.

---

## Step 1 — Create the Neon project

Create a project in the Neon console and copy **both** connection strings from the Connect dialog:

- **Pooled** — hostname contains `-pooler`. This is `DATABASE_URL`, used by the application.
- **Direct** — no `-pooler`. This is `DIRECT_URL`, used by the Prisma CLI.

Two strings are required because Neon's pooler runs PgBouncer in transaction mode, which cannot
execute the DDL that migrations need. Application queries want the pooler; migrations want a
direct connection.

Also create a second Neon **branch** named `test` and save its direct URL as `TEST_DATABASE_URL`.
Integration tests in [06-payments-api.md](06-payments-api.md) run against it, so they can truncate
tables without touching development data. Branching is instant and free on Neon, which is the main
reason it was picked over a local Docker Postgres: the test database is identical to production.

## Step 2 — Install and initialise Prisma

```bash
npm install @prisma/client @prisma/adapter-neon
npm install -D prisma
npx prisma init
```

Do **not** install `@neondatabase/serverless` or `ws`. `@prisma/adapter-neon` bundles both.

## Step 3 — `prisma.config.ts`

Prisma 7 moved CLI connection configuration out of the schema and into a config file at the
project root:

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DIRECT_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
```

## Step 4 — Schema

`prisma/schema.prisma`. Note the datasource block has **no `url`** — that is Prisma 7 behaviour,
and leaving one in is the most common migration error.

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model Order {
  id         String      @id @default(cuid())
  userId     String      @map("user_id")
  customer   String
  dueDate    DateTime    @map("due_date") @db.Date
  totalCents Int         @map("total_cents")
  paidCents  Int         @default(0) @map("paid_cents")
  createdAt  DateTime    @default(now()) @map("created_at")
  updatedAt  DateTime    @updatedAt @map("updated_at")

  user     User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  items    OrderItem[]
  payments Payment[]

  @@index([userId, dueDate])
  @@index([userId, createdAt])
  @@map("orders")
}

model OrderItem {
  id             String @id @default(cuid())
  orderId        String @map("order_id")
  description    String
  quantity       Int
  unitPriceCents Int    @map("unit_price_cents")
  lineTotalCents Int    @map("line_total_cents")

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
  @@map("order_items")
}

model Payment {
  id          String   @id @default(cuid())
  orderId     String   @map("order_id")
  amountCents Int      @map("amount_cents")
  paidAt      DateTime @map("paid_at") @db.Date
  note        String?
  createdAt   DateTime @default(now()) @map("created_at")

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId, paidAt])
  @@map("payments")
}
```

The `User` model is not written by hand — Better Auth generates it in
[03-auth.md](03-auth.md), and the `orders Order[]` back-relation is added there. Until that phase
runs, comment out the `user` relation field so the schema validates.

### Why the schema looks like this

**`paidCents` is denormalised onto `Order`.** The sum of payments could be computed on every read,
but keeping a running total buys three things: the overpayment check reads a single row instead of
aggregating, the row can be locked, and the status filter in the dashboard becomes a plain indexed
`WHERE` instead of a `HAVING` over a join. The cost is that it can drift, which is exactly what
the CHECK constraint in step 5 and the reconciliation job in the production roadmap exist to
prevent.

**`lineTotalCents` is stored, not computed.** It is redundant with `quantity * unitPriceCents`
today. It is stored because a line item is a financial record: if the price of an item is ever
allowed to change, the historical line must keep the amount that was actually charged.

**Dates are `@db.Date`, not timestamps.** A due date is a calendar day, not an instant. Storing it
as a timestamp invites a bug where an order created at 21:00 in UTC-3 becomes due a day early. The
timezone assumption is documented in the README.

**Cascades.** Deleting a user removes their orders; deleting an order removes its items and
payments. In a real ledger, payments would never cascade — see the roadmap's note on immutability.

## Step 5 — Migration with database-level invariants

```bash
npx prisma migrate dev --name init
```

Then add a second migration for constraints Prisma cannot express:

```bash
npx prisma migrate dev --create-only --name financial_invariants
```

Edit the generated SQL:

```sql
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_total_non_negative" CHECK ("total_cents" >= 0),
  ADD CONSTRAINT "orders_paid_within_total"
    CHECK ("paid_cents" >= 0 AND "paid_cents" <= "total_cents");

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" >= 1),
  ADD CONSTRAINT "order_items_unit_price_non_negative" CHECK ("unit_price_cents" >= 0),
  ADD CONSTRAINT "order_items_line_total_consistent"
    CHECK ("line_total_cents" = "quantity" * "unit_price_cents");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive" CHECK ("amount_cents" >= 1);
```

Apply it with `npx prisma migrate dev`.

These constraints are not belt-and-braces decoration. Application-level validation protects
against bad requests; a CHECK constraint protects against a bug in the application itself, a
half-finished migration, or a manual `UPDATE` run in a console at 2am. `paid_cents <= total_cents`
means overpayment is structurally impossible in this database, independent of any code path.

## Step 6 — Prisma client singleton

`src/server/db/prisma.ts`:

```ts
import { PrismaClient } from "@/generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";

const createClient = () =>
  new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

Three things worth knowing about this file:

- The client is imported from `@/generated/prisma`, not `@prisma/client`. Prisma 7 generates to a
  local path.
- The `globalThis` cache exists for development. Next.js hot reload re-evaluates modules, and
  without it every save opens a new pool and exhausts Neon's connection limit within minutes. In
  production each serverless instance is its own process, so the cache does nothing and PgBouncer
  handles multiplexing.
- `PrismaNeon` talks to Neon over WebSockets rather than HTTP. This matters for
  [06-payments-api.md](06-payments-api.md): the HTTP driver cannot hold an interactive transaction
  open across multiple statements, which is precisely what `SELECT ... FOR UPDATE` followed by an
  `INSERT` requires.

Never call `$disconnect()` in request code. Warm serverless instances reuse the connection.

## Step 7 — Commit

```bash
git commit -am "feat: add neon postgres schema with financial check constraints"
```
