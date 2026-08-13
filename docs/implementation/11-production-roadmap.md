# Phase 11 — Production roadmap document

**Goal.** Write `docs/production-roadmap.md`: the honest account of what separates this take-home
from something that could hold real money.

**Definition of done.** Every simplification made during the build appears in the document,
described as a decision with a reason rather than as an omission.

---

## Why this document exists

The assignment asks the README to cover "what you would improve before production", and lists
communication as an explicit evaluation criterion. A reviewer cannot tell the difference between a
gap you did not see and a gap you chose to leave — unless you write it down.

Splitting it out of the README keeps the README focused on running and understanding the app, and
gives this content room to be specific. The README carries a three-paragraph summary and links
here.

## Writing rules

Every item answers three questions in two or three sentences: **what is missing**, **why it
matters**, and **how it would be implemented**. An item that cannot answer the third question is
not a roadmap item, it is a wish.

Never write "add proper error handling" or "improve security". Write "an `Idempotency-Key` header
persisted with a unique constraint, returning the original response on replay, so a client retrying
after a timeout cannot double-record a payment".

Mark what was a **scope decision** versus what is a **known gap**. Those are different signals.

## Structure

### 1. Context

Two paragraphs: what was built, what the time budget was, and the principle that guided the
trade-offs — correctness of the money path first, everything else second.

### 2. Authentication and security

Better Auth already provides scrypt password hashing, database-backed revocable sessions, and
correctly flagged cookies. What is missing:

- **Rate limiting and progressive lockout on login.** Without it, the login endpoint is an
  unbounded password oracle. Serverless has no shared memory, so this needs Upstash Redis or an
  attempts table in Postgres keyed by email and IP.
- **Email verification and password reset.** Single-use, expiring, hashed-at-rest tokens plus a
  transactional email provider. Resetting a password must invalidate every other session.
- **Multi-factor authentication.** TOTP via Better Auth's plugin, mandatory for any account that
  can view financial records.
- **Authentication audit log.** Every login, failure, password change and session revocation, with
  IP and user agent. Expected in any regulated environment.
- **Security headers and secret rotation.** CSP, HSTS, a documented rotation procedure for
  `BETTER_AUTH_SECRET`, and a review of CSRF on state-changing routes.

State plainly that hand-rolling authentication was considered and rejected: in a regulated context
an audited library is the more defensible choice, and the hours were better spent on transactional
integrity.

### 3. Financial integrity

The most important section, and the one a fintech reviewer will read closest.

- **Idempotency on payment recording.** As described above. The single highest-value addition to
  the current API.
- **Immutable payments with compensating entries.** Payments cannot currently be corrected at all.
  The answer is never `UPDATE` or `DELETE` — it is a reversal entry that nets to zero, leaving both
  the mistake and its correction visible.
- **A double-entry ledger instead of a denormalised `paidCents`.** The current design is a cached
  aggregate protected by a lock and a CHECK constraint. A ledger of immutable entries, with balance
  derived by summing them, makes drift structurally impossible and gives an audit trail for free.
  Explain why it was not done now: it is the right model, and it is more machinery than a six-hour
  exercise justifies.
- **Reconciliation job.** Until the ledger exists, a scheduled check that
  `SUM(payments.amount_cents) = orders.paid_cents` for every order, alerting on any mismatch. Cheap
  insurance for a denormalised total.
- **Multi-currency.** Every amount currently assumes one implicit currency. Real support means
  storing a currency code alongside every amount, forbidding arithmetic across currencies at the
  type level, and deciding how exchange rates are captured at payment time.
- **Rounding and tax.** Order total equals subtotal by assignment. Introducing percentage discounts
  or tax raises the rounding question — half-up per line or on the total — which must be a stated
  policy, not an accident of implementation.

### 4. Concurrency and data

- **Behaviour of the row lock under contention**, an explicit `lock_timeout` so a stuck transaction
  fails fast instead of queueing, and what changes if the app ever runs multi-region.
- **Cursor pagination** in place of `skip`/`take`, which degrades and can skip rows when data
  changes between pages.
- **Index review** against real query plans rather than assumption.
- **Soft delete** for orders. A hard `DELETE` on a financial document destroys history.

### 5. Operations

- **Migrations in CI** with a review gate and a rehearsed rollback, plus expand-and-contract to
  remove the schema-ahead-of-code window described in [10-deploy.md](10-deploy.md).
- **Backups and point-in-time recovery** on Neon, with a restore that has actually been tested.
- **Error tracking and structured logging** — Sentry, request ids threaded through every log line,
  and no monetary values or personal data in log output.
- **Health check and uptime monitoring.**
- **End-to-end tests** with Playwright covering the assignment scenario, run against preview
  deployments so a regression in the payment flow blocks the merge.

### 6. Product

Multi-tenant organisations with roles, due-date notifications, an accounting export, full order
audit history in the UI, and attachments on payments for remittance advice.

### 7. Summary table

Close with each item scored by impact and effort, and name the three that would come first:
idempotency, rate limiting, and the reconciliation job. A roadmap without an ordering is a list.

## Commit

```bash
git commit -am "docs: add production readiness roadmap"
```
