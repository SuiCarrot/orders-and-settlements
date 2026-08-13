<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Orders and Settlements

B2B orders, line items, partial payments, and a derived status — with a hard invariant that
recorded payments can never exceed an order total, including under concurrent requests.

## Non-negotiable invariants

- **`src/server/domain/` imports nothing from outside that folder.** No Prisma, no Next, no auth.
  This is what makes money and status logic unit-testable without a database. If a change here
  needs infrastructure, it belongs in `src/server/services/` instead.
- **Money is an integer number of cents everywhere it is stored or computed.** Never a `number` for
  currency arithmetic. Parse and format at the boundary only (`src/server/domain/money.ts`).
- **Status is derived, never stored.** No `status` column. `deriveStatus` in
  `src/server/domain/status.ts` is the single source of truth; `orderStatusWhere` in
  `src/server/services/order-service.ts` is a hand-maintained SQL mirror of it — update both
  together, or the dashboard filters silently disagree with the detail page.
- **Authorization is `requireUser()` plus a `userId` filter on every query, not `proxy.ts`.** The
  proxy only redirects logged-out visitors for a better first paint; it is not a security boundary.

## Commands

- `npm run dev` — start the app.
- `npm test` — unit tests, no database, milliseconds.
- `npm run test:integration` — concurrency and row-lock tests against real Postgres; needs
  `TEST_DATABASE_URL` / `TEST_DIRECT_URL`.
- `npm run typecheck` / `npm run lint` — run both before considering a change done.
- `npm run db:seed` — idempotent demo data, scoped to its own user; never destructive.
- `npm run verify:scenario` — the core payment scenario over HTTP against a running server
  (`BASE_URL=<url>` to point it at a deployment).

## Where the reasoning lives

- `README.md` — status precedence, concurrency approach, API contract, assumptions and trade-offs.
- `docs/production-roadmap.md` — what is deliberately out of scope versus a known gap, and what
  would ship first toward production.
- `docs/implementation/` — phase-by-phase build notes with the decisions behind each piece
  (`README.md` there lists the global conventions: English only, money as a decimal string on the
  wire, one error contract shape).

Read the relevant one before changing behaviour in that area — most non-obvious choices here are
deliberate and already have a documented reason.
