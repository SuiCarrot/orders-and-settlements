# Phase 12 — Root README

**Goal.** The document most people will read first, and possibly the only one they read in full.

**Definition of done.** Someone who has never seen the repository can go from clone to running app
by following it literally, and can answer "how does status work" and "what happens on concurrent
payments" without opening a source file.

---

## What the README needs to cover

The deliverables list is explicit. Cover all of it:

- Prerequisites and step-by-step setup
- API overview with the main endpoints
- Status derivation rules and edge-case decisions
- Assumptions and trade-offs
- What you would improve before production
- The deployed URL

Structure, precision and honesty about limitations count.

## Structure

### Header

Project name, one sentence describing what it does, and immediately: **the live URL and the demo
credentials.** Nothing above them. Someone with fifteen minutes should be one click from a
working app.

A short row of badges for the stack — Next.js 16, Postgres, Prisma 7, Better Auth — orients a
reader in two seconds.

### Screenshots

Two: the dashboard with orders in every status, and the overpayment error showing its actionable
message. The second one is a screenshot of the single hardest requirement being met.

### Quick start

Numbered, copy-pasteable, no assumed knowledge:

```bash
git clone <repo> && cd orders-and-settlements
npm install
cp .env.example .env      # fill in Neon connection strings and BETTER_AUTH_SECRET
npm run db:migrate
npm run db:seed
npm run dev
```

State the prerequisites — Node 20+, a free Neon account — and explain why two connection strings
are needed in one sentence. Include the commands for running the tests, separating unit tests
(no database required) from integration tests (Neon `test` branch required).

### API overview

A table of endpoints, then two or three complete `curl` examples with real request and response
bodies. Include a successful payment and a rejected one, because the error contract is easier to
show than to describe.

Document the conventions in a short list: money crosses the wire as a decimal string, dates are
`YYYY-MM-DD`, all errors share one shape, and codes are `400` validation, `401` unauthenticated,
`404` not found or not owned, `409` business-rule conflict.

### Status derivation

The precedence rules as a numbered list, then the edge cases as prose. This section documents
cases like an order that was overdue and is now fully paid. Cover:

- `paid` takes precedence over `overdue`, and why status answers "what needs my attention".
- `overdue` takes precedence over `pending` and `partially_paid`.
- Due dates are calendar days compared in UTC; an order due today is not yet overdue.
- Orders require at least one line item and a total of at least one cent, so a zero-total order
  cannot be born `paid`.

### Concurrency

Short, concrete, and near the top — this is the single most important guarantee in the system.
Describe the failure
mode in one sentence, the `SELECT ... FOR UPDATE` solution in two, name the CHECK constraint as the
final guarantee, and list the alternatives considered with the reason each was rejected. The
sequence diagram from [06-payments-api.md](06-payments-api.md) carries this better than prose.

Say explicitly that it is proven by an automated test, and name the file.

### Editability after payment

This decision needs to be stated either way. State the rule — line items lock after the first
payment, `customer` and `dueDate` stay editable, deletion is blocked — then the reasoning:
`totalCents` is the ceiling every recorded payment was validated against, so it becomes history
once money has moved, while metadata corrections do not carry that risk.

### Assumptions and trade-offs

The section that shows judgement. Each entry is one or two sentences.

- Single implicit currency; every amount is in the same one.
- Money stored as integer cents and transported as decimal strings, to keep IEEE-754 out of the
  ledger entirely.
- Status derived on read rather than stored, so it cannot drift from the payments that produce it.
- `paidCents` denormalised onto the order for lockability and indexed filtering, with a CHECK
  constraint and reconciliation as the safety net.
- Authentication delegated to Better Auth; hand-rolled auth was considered and rejected, with the
  reasoning.
- Offset pagination, adequate at this scale.
- Payments are append-only; there is no correction path yet.

### Testing

What is covered and what deliberately is not. Name the three areas that matter most —
payment allocation, status transitions, overpayment rejection — and point at the files. Mention
that the concurrency guarantee is tested against a real Postgres branch, because it cannot be
demonstrated any other way.

### Improvements before production

Three paragraphs summarising the top items — idempotency, rate limiting, reconciliation — then link
to [../production-roadmap.md](../production-roadmap.md) for the full treatment.

### Project structure

A short annotated tree, emphasising the one architectural rule: `src/server/domain/` is pure and
imports nothing from infrastructure, which is what makes the business rules testable in isolation.

## Tone

Plain, specific, no marketing. Prefer "payments are append-only; corrections require a new order"
over "robust payment handling". Where something is incomplete, say so and say why — a document
that admits its gaps is more trustworthy than one that does not appear to have any.

## Commit

```bash
git commit -am "docs: write project readme"
```
