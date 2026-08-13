# Production readiness roadmap

This take-home models B2B orders, line items, partial payments and derived status, with a hard
invariant that recorded payments can never exceed an order total — including when two requests
arrive at the same instant. The money path (integer cents, row-level locking, CHECK constraints,
actionable `409 OVERPAYMENT`) was treated as non-negotiable. Everything else was scoped to fit a
short exercise.

The principle behind the trade-offs: **correctness of the money path first, everything else
second.** There is a real difference between a gap that was not seen and a gap that was chosen
deliberately. This document is the latter, itemised.

Each item answers three questions: what is missing, why it matters, and how it would be
implemented. Items marked **scope decision** were considered during the build and deliberately
deferred. Items marked **known gap** were not worth the hours inside the budget, but would block
a production launch.

---

## Authentication and security

Better Auth already provides scrypt password hashing, database-backed revocable sessions, and
`Secure` / `HttpOnly` / `SameSite=Lax` cookies. Hand-rolling authentication was considered and
rejected: in a regulated context an audited library is the more defensible choice, and the hours
were better spent on transactional integrity.

- **Rate limiting and progressive lockout on login.** *(known gap)* Without it, `/api/auth/sign-in/email`
  is an unbounded password oracle. Serverless functions have no shared memory, so this needs an
  attempts table in Postgres (or Upstash Redis) keyed by normalised email and IP, with exponential
  backoff after N failures and a lockout window that is itself rate-limited to prevent lockout
  DoS. Better Auth's rate-limit plugin plus a small `login_attempts` model is enough.

- **Email verification and password reset.** *(scope decision)* Not part of this build.
  Production needs single-use, expiring, hashed-at-rest tokens plus a transactional email provider
  (Resend, Postmark). Resetting a password must revoke every other session for that user — Better
  Auth already stores sessions as rows, so this is a `deleteMany` on `session` inside the same
  transaction as the password update.

- **Multi-factor authentication.** *(known gap)* TOTP via Better Auth's two-factor plugin, mandatory
  for any account that can view financial records. Backup codes stored hashed. Without MFA, a
  leaked password is a leaked ledger.

- **Authentication audit log.** *(known gap)* Every login, failure, password change and session
  revocation, with IP and user agent, retained for the period a regulator would ask for. A
  `auth_events` table written in the same request as the event, never fire-and-forget.

- **Security headers and secret rotation.** *(known gap)* CSP, HSTS (Vercel already sends a baseline),
  a documented rotation procedure for `BETTER_AUTH_SECRET` (dual-secret window so existing sessions
  survive), and an explicit review of CSRF on state-changing routes. `BETTER_AUTH_URL` must match
  the canonical production origin; a mismatch produces 403s that the login form currently collapses
  into "Invalid email or password."

---

## Financial integrity

- **Idempotency on payment recording.** *(scope decision, highest-value addition)* A client that
  retries after a timeout can record the same payment twice, and both writes are legitimately
  within the total. The fix is an `Idempotency-Key` header stored with a unique constraint
  `(user_id, key)`, returning the original response on replay. Without it, the row lock prevents
  overpayment but not double-recording of a legitimate remainder.

- **Immutable payments with compensating entries.** Refunds are a separate `Refund` row, never a
  negative payment. They lock the same order row as payments, decrement `paidCents`, and reverse
  derived status (`paid` → `partially_paid` / `overdue` / `refunded`). A mistaken refund
  is corrected by a new payment — refund rows are never updated or deleted.

- **A double-entry ledger instead of a denormalised `paidCents`.** *(scope decision)* The current
  design is a cached aggregate protected by a lock and a CHECK constraint. A ledger of immutable
  entries, with balance derived by summing them, makes drift structurally impossible and gives an
  audit trail for free. It is the right model, and it is more machinery than the current scale
  justifies: every read of "amount due" becomes a sum, filtering by status needs a `HAVING` or a
  maintained view, and the dashboard would get slower for no visible benefit at this scale.

- **Reconciliation job.** *(known gap)* Until the ledger exists, a scheduled check that
  `SUM(payments.amount_cents) - SUM(refunds.amount_cents) = orders.paid_cents` for every order,
  alerting on any mismatch. A Vercel cron hitting a route that runs the query and pages on Slack
  is cheap insurance for a denormalised total.

- **Multi-currency.** *(scope decision)* Every amount assumes one implicit currency. Real support
  means storing an ISO code alongside every amount, forbidding arithmetic across currencies at the
  type level (`Cents<"USD">`), and capturing the exchange rate at payment time rather than at
  display time.

- **Rounding and tax.** *(scope decision)* Order total equals subtotal in the current model. Introducing
  percentage discounts or tax raises the rounding question — half-up per line, or on the total —
  which must be a stated policy, not an accident of `Math.round`.

---

## Concurrency and data

- **Lock behaviour under contention.** *(known gap)* `SELECT ... FOR UPDATE` is correct, but a stuck
  transaction can queue every subsequent payment on that order. Set `lock_timeout` (for example
  `3s`) inside the transaction so a waiter fails fast with a retryable `409` rather than sitting on
  a pooled connection until the transaction timeout fires. Multi-region would make this worse: the
  lock is per-primary, and a replica cannot take it.

- **Cursor pagination.** *(scope decision)* Offset `skip`/`take` degrades and can skip rows when
  data changes between pages. Keyset pagination on `(created_at, id)` is the replacement. Adequate
  at this scale; the dashboard currently filters client-side from a single load of up to 100
  orders.

- **Index review against real query plans.** *(known gap)* The composite indexes on
  `(user_id, due_date)` and `(user_id, created_at)` were chosen from the query shapes, not from
  `EXPLAIN ANALYZE` on production-sized data.

- **Soft delete for orders.** *(known gap)* A hard `DELETE` on a financial document destroys
  history. `deleted_at` plus a default `WHERE deleted_at IS NULL` keeps the row for audit and
  still hides it from the dashboard.

- **The SQL mirror of `deriveStatus`.** *(known gap)* `orderStatusWhere` re-expresses every branch
  of the status function as a Prisma `where` clause, and the two are kept in sync by hand — adding
  `refunded` meant editing both, plus the summary aggregates that must exclude fully refunded
  orders. Nothing proves they agree. The cheap fix is a partition test: seed one order per status,
  then assert the filters' counts sum to the total and that no order matches two of them. The
  structural fix is removing the duplication with a generated column maintained by the database.
  The seed also has no refunded fixture, so that branch is absent from the demo dashboard.

---

## Capacity and scaling

The deployed instance runs on Neon's free plan and Vercel's Hobby plan. The figures below come from
platform limits and query shapes, not from a load test — replacing estimates with measurements is
the first item in this section for a reason.

- **A load test before any capacity number is quoted.** *(known gap)* k6 or Artillery against a
  preview deployment, in three profiles: read-heavy dashboard traffic, writes spread across
  distinct orders, and writes contending on one order. The third is the only one that exercises
  the row lock. Until that exists, every throughput number in this document is an estimate.

- **Compute, not storage, is the free-tier ceiling.** *(scope decision)* Neon's free plan allows
  100 CU-hours per project per month and 0.5 GB of storage, with scale-to-zero after five minutes
  that cannot be disabled. At the smallest 0.25 CU that is roughly 400 hours of active compute, so
  an app in continuous use exhausts the month's compute long before its storage. Storage is spent
  on orders, items, payments and events — on the order of 2–3 KB per order with indexes, so
  roughly 150k orders — not on accounts, where a user with a session and a credential row is well
  under a kilobyte. The first paid step is Neon's Launch plan with an autoscaling floor above
  zero, which also removes the cold start on the first request after an idle period.

- **Connection budget under transaction pinning.** *(known gap)* The app already connects through
  Neon's built-in PgBouncer (the `-pooler` hostname), so pooling is not the missing piece. What
  matters is that transaction-mode pooling pins a server connection for the whole transaction, and
  `recordPayment` holds one from the `SELECT … FOR UPDATE` through the event insert and the final
  re-read. Pool size is about 90% of `max_connections`, which scales with compute size (roughly
  112 at 0.25 CU). Scaling means shortening the transaction — the trailing re-read can be dropped
  in favour of the row the `UPDATE` already returns — setting `statement_timeout` so nothing pins
  a slot indefinitely, and raising the autoscaling floor.

- **The transaction timeout binds before the function timeout.** *(known gap)* Vercel functions on
  fluid compute default to 300 seconds, so the platform is not what kills a queued payment. The
  interactive transaction is capped at `timeout: 10_000` with the default 2s `maxWait`, so a
  request waiting on the row lock fails with Prisma's `P2028` first, and that currently surfaces
  as a `500`. It should map to a retryable `409`/`503` with `Retry-After`, together with the
  `lock_timeout` item above.

- **A session read on every protected request.** *(known gap)* `requireUser()` calls Better Auth's
  `getSession`, which reads the `session` table; React's `cache()` only deduplicates within a
  single render, so each API route and each page render pays a round trip before its first
  business query. Better Auth's `session.cookieCache` puts signed session data in the cookie with
  a short TTL and removes most of those reads with no new infrastructure. The trade-off is
  revocation lag bounded by the TTL — 60s is defensible here, and sign-out clears the cookie
  immediately. Redis through `secondaryStorage` is the step after that, and only if instant
  revocation without a database read becomes a requirement.

- **Asynchronous payment processing.** *(scope decision)* A queue in front of payment recording
  (QStash, or Redis with BullMQ) would absorb a burst against a single hot order. Deferred
  deliberately: the lock is per order row, so unrelated payments never queue behind each other,
  and the realistic B2B pattern is a few payments per order over weeks. It also turns a
  synchronous `201` carrying the updated order into an accepted-and-poll contract, which is a
  product decision rather than an infrastructure one. Idempotency keys are a prerequisite for it,
  not a detail of it.

---

## Operations

- **Migrations in CI, not only in `next build`.** *(scope decision)* The build script runs
  `prisma migrate deploy` so schema and code ship together. The trade-off, with a single database,
  is a brief window where the new schema runs against the old code. Expand-and-contract (additive
  migration, deploy code, then drop the old column) removes that window. A review gate on
  migration files and a rehearsed rollback (`migrate resolve` + restore) belong in CI before any
  of that.

- **Backups and point-in-time recovery.** *(known gap)* Neon's free plan keeps a six-hour restore
  window; a real retention period needs a paid plan. Either way, a restore that has never been
  tested is not a restore. Schedule a quarterly restore into a throwaway branch and run
  `npm run verify:scenario` against it.

- **Error tracking and structured logging.** *(known gap)* Sentry for exceptions, a request id
  threaded through every log line, and a hard rule: no monetary values, emails or tokens in log
  output. `console.error("Unhandled error", error)` in the API error mapper is the current
  ceiling.

- **Health check and uptime monitoring.** *(known gap)* `GET /api/health` that pings Postgres
  (`SELECT 1`) and returns `503` if it cannot, plus an external check (Better Stack, Checkly)
  against `/login`.

- **End-to-end tests on preview deployments.** *(known gap)* Playwright covering the core
  scenario (create → $400 → $600 → reject $1), run against Vercel preview URLs so a regression in
  the payment flow blocks the merge. `scripts/verify-scenario.ts` is the HTTP version of this;
  wiring it to preview deploys is the missing CI step.

- **Preview database isolation.** *(scope decision)* Integration tests share the Neon project via
  a `test_isolation` schema rather than a Neon branch, because provisioning did not go through
  the Neon API. Preview deployments currently share production data. Neon-managed Vercel integration
  with per-preview branches is the production answer — it was skipped because it would have
  provisioned a *second* database and injected `DATABASE_URL_UNPOOLED` instead of the
  `DIRECT_URL` this repo's Prisma config expects.

---

## Product

Multi-tenant organisations with roles (collections vs. finance vs. admin), due-date notifications,
an export in an accounting package's own format rather than the generic CSV that ships today, and
attachments on payments for remittance advice. None of these change the invariant; they change who
can see it and how they work a queue.

---

## What would ship first

| Item | Kind | Impact | Effort | Order |
|------|------|--------|--------|-------|
| Idempotency-Key on payments | Scope decision | High | S | 1 |
| Rate limiting / lockout on login | Known gap | High | S | 2 |
| Reconciliation job on `paidCents` | Known gap | High | S | 3 |
| `lock_timeout` + retryable lock error | Known gap | Medium | S | 4 |
| Session cookie cache | Known gap | Medium | S | 5 |
| Auth audit log | Known gap | Medium | S | 6 |
| Status filter partition test | Known gap | Medium | S | 7 |
| Expand-and-contract migrations | Scope decision | Medium | M | 8 |
| Playwright on preview deploys | Known gap | Medium | M | 9 |
| Load test against a preview deployment | Known gap | Medium | M | 10 |
| Double-entry ledger | Scope decision | High | L | later |
| MFA | Known gap | High | M | later |
| Multi-currency | Scope decision | Medium | L | later |
| Async payment queue | Scope decision | Low | L | later |
| Cursor pagination | Scope decision | Low | S | later |

The first three — **idempotency, rate limiting, reconciliation** — close the three ways this
system can currently lose money or leak accounts without any new product surface. The next two are
the cheapest scaling work available: both are small, and each removes a way the system degrades
under load rather than under attack. Everything after that is how you would operate it, not how
you would trust it.
