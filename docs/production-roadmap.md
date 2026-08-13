# Production readiness roadmap

This take-home models B2B orders, line items, partial payments and derived status, with a hard
invariant that recorded payments can never exceed an order total — including when two requests
arrive at the same instant. The money path (integer cents, row-level locking, CHECK constraints,
actionable `409 OVERPAYMENT`) was treated as non-negotiable. Everything else was scoped to fit a
short exercise.

The principle behind the trade-offs: **correctness of the money path first, everything else
second.** A reviewer at a financial company can tell the difference between a gap we did not see
and a gap we chose to leave. This document is the latter.

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

- **Email verification and password reset.** *(scope decision)* Out of scope for the assignment.
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

The section a fintech reviewer will read closest.

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
  audit trail for free. It is the right model, and it is more machinery than this exercise
  justifies: every read of "amount due" becomes a sum, filtering by status needs a `HAVING` or a
  maintained view, and the assignment's dashboard would get slower for no visible benefit at this
  scale.

- **Reconciliation job.** *(known gap)* Until the ledger exists, a scheduled check that
  `SUM(payments.amount_cents) - SUM(refunds.amount_cents) = orders.paid_cents` for every order,
  alerting on any mismatch. A Vercel cron hitting a route that runs the query and pages on Slack
  is cheap insurance for a denormalised total.

- **Multi-currency.** *(scope decision)* Every amount assumes one implicit currency. Real support
  means storing an ISO code alongside every amount, forbidding arithmetic across currencies at the
  type level (`Cents<"USD">`), and capturing the exchange rate at payment time rather than at
  display time.

- **Rounding and tax.** *(scope decision)* Order total equals subtotal by assignment. Introducing
  percentage discounts or tax raises the rounding question — half-up per line, or on the total —
  which must be a stated policy, not an accident of `Math.round`.

---

## Concurrency and data

- **Lock behaviour under contention.** *(known gap)* `SELECT ... FOR UPDATE` is correct, but a stuck
  transaction can queue every subsequent payment on that order. Set `lock_timeout` (for example
  `3s`) inside the transaction so a waiter fails fast with a retryable `409` rather than hanging
  the serverless function. Multi-region would make this worse: the lock is per-primary, and a
  replica cannot take it.

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

---

## Operations

- **Migrations in CI, not only in `next build`.** *(scope decision)* The build script runs
  `prisma migrate deploy` so schema and code ship together. The trade-off, with a single database,
  is a brief window where the new schema runs against the old code. Expand-and-contract (additive
  migration, deploy code, then drop the old column) removes that window. A review gate on
  migration files and a rehearsed rollback (`migrate resolve` + restore) belong in CI before any
  of that.

- **Backups and point-in-time recovery.** *(known gap)* Neon PITR exists on paid plans. A restore
  that has never been tested is not a restore. Schedule a quarterly restore into a throwaway
  branch and run `npm run verify:scenario` against it.

- **Error tracking and structured logging.** *(known gap)* Sentry for exceptions, a request id
  threaded through every log line, and a hard rule: no monetary values, emails or tokens in log
  output. `console.error("Unhandled error", error)` in the API error mapper is the current
  ceiling.

- **Health check and uptime monitoring.** *(known gap)* `GET /api/health` that pings Postgres
  (`SELECT 1`) and returns `503` if it cannot, plus an external check (Better Stack, Checkly)
  against `/login`.

- **End-to-end tests on preview deployments.** *(known gap)* Playwright covering the assignment
  scenario (create → $400 → $600 → reject $1), run against Vercel preview URLs so a regression in
  the payment flow blocks the merge. `scripts/verify-scenario.ts` is the HTTP version of this;
  wiring it to preview deploys is the missing CI step.

- **Preview database isolation.** *(scope decision)* Integration tests share the Neon project via
  a `test_isolation` schema rather than a Neon branch, because this build did not have Neon API
  access. Preview deployments currently share production data. Neon-managed Vercel integration
  with per-preview branches is the production answer — it was skipped because it would have
  provisioned a *second* database and injected `DATABASE_URL_UNPOOLED` instead of the
  `DIRECT_URL` this repo's Prisma config expects.

---

## Product

Multi-tenant organisations with roles (collections vs. finance vs. admin), due-date notifications,
an accounting export (CSV is sketched in the extras doc), full order audit history in the UI, and
attachments on payments for remittance advice. None of these change the invariant; they change who
can see it and how they work a queue.

---

## What would ship first

| Item | Kind | Impact | Effort | Order |
|------|------|--------|--------|-------|
| Idempotency-Key on payments | Scope decision | High | S | 1 |
| Rate limiting / lockout on login | Known gap | High | S | 2 |
| Reconciliation job on `paidCents` | Known gap | High | S | 3 |
| Auth audit log | Known gap | Medium | S | 4 |
| Compensating refunds | Scope decision | Medium | M | 5 |
| Expand-and-contract migrations | Scope decision | Medium | M | 6 |
| Playwright on preview deploys | Known gap | Medium | M | 7 |
| Double-entry ledger | Scope decision | High | L | later |
| MFA | Known gap | High | M | later |
| Multi-currency | Scope decision | Medium | L | later |
| Cursor pagination | Scope decision | Low | S | later |

The first three — **idempotency, rate limiting, reconciliation** — close the three ways this
system can currently lose money or leak accounts without any new product surface. Everything after
that is how you would operate it, not how you would trust it.
