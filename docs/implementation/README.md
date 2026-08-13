# Implementation Guide

Step-by-step breakdown of the Orders and Settlements build. Each phase is a self-contained
document with its goal, ordered steps, code, the decisions behind them, and a definition of done.

Phases are meant to be executed in order — each one leaves the app in a working, committable state.

| # | Phase | Document | Output |
|---|-------|----------|--------|
| 1 | Scaffold | [01-scaffold.md](01-scaffold.md) | Next.js app, tooling, folder structure |
| 2 | Database | [02-database.md](02-database.md) | Neon + Prisma, schema, CHECK constraints |
| 3 | Authentication | [03-auth.md](03-auth.md) | Better Auth, session guard, login/register |
| 4 | Domain | [04-domain.md](04-domain.md) | Pure money/totals/status modules + unit tests |
| 5 | Orders API | [05-orders-api.md](05-orders-api.md) | REST CRUD, validation, error contract |
| 6 | Payments API | [06-payments-api.md](06-payments-api.md) | Locked transaction, overpayment rejection |
| 7 | Dashboard | [07-dashboard.md](07-dashboard.md) | Order list, status filter, pagination |
| 8 | Order detail | [08-order-detail.md](08-order-detail.md) | Line items, payment history, payment form |
| 9 | Seed | [09-seed.md](09-seed.md) | Demo data + assignment scenario verification |
| 10 | Deploy | [10-deploy.md](10-deploy.md) | Vercel + Neon, live URL |
| 11 | Production roadmap | [11-production-roadmap.md](11-production-roadmap.md) | `docs/production-roadmap.md` |
| 12 | README | [12-readme.md](12-readme.md) | Final root README |
| 13 | Extras | [13-extras.md](13-extras.md) | Audit log, CSV export, refunds |

## Global conventions

**Language.** Everything committed to this repository is written in English: code, identifiers,
UI copy, error messages, commit messages, and documentation. The reviewer is an international team.

**Money is never a float.** Every monetary value is stored and computed as an integer number of
cents (`totalCents`, `paidCents`, `unitPriceCents`, `amountCents`). Conversion to and from decimal
strings happens only at the API boundary, using integer arithmetic. See
[04-domain.md](04-domain.md).

**Money crosses the API as a string.** Request and response bodies carry `"1000.00"`, not
`1000.00`. This is deliberate: JSON numbers are IEEE-754 doubles, and a client that round-trips
`0.1 + 0.2` through a payment endpoint should not be able to corrupt a ledger. Documented as an
explicit decision in the README.

**Status is derived, never stored.** There is no `status` column. Status is a pure function of
`totalCents`, `paidCents`, `dueDate` and the current date, so it can never drift out of sync with
the payments that produced it. See [04-domain.md](04-domain.md).

**Authorization is per-handler.** `proxy.ts` only performs optimistic redirects for logged-out
visitors. Real authorization happens inside every route handler and server component through
`requireUser()`, and every query is scoped by `userId` in its `where` clause. See
[03-auth.md](03-auth.md).

**One error contract.** Every non-2xx response has the same shape, built by a single helper:

```json
{
  "error": {
    "code": "OVERPAYMENT",
    "message": "Payment of $1.00 exceeds the remaining balance of $0.00 for this order.",
    "details": { "maxAllowedAmount": "0.00", "orderTotal": "1000.00", "amountPaid": "1000.00" }
  }
}
```

`400` for schema validation, `401` unauthenticated, `404` not found or not yours, `409` for
business-rule conflicts such as overpayment. See [05-orders-api.md](05-orders-api.md).

**Commits.** One commit per phase, imperative mood, English:
`feat: record payments with overpayment protection`.

## Pinned versions

Verified at the start of the build. Install with these majors; let patch versions float.

| Package | Version |
|---------|---------|
| next | 16.3.x |
| react | 19.2.x |
| prisma / @prisma/client | 7.9.x |
| @prisma/adapter-neon | 7.9.x |
| better-auth | 1.6.x |
| zod | 4.4.x |
| vitest | 4.1.x |
| tailwindcss | 4.3.x |

Two version-specific gotchas that invalidate most tutorials you will find:

- **Next.js 16 renamed `middleware.ts` to `proxy.ts`** and moved it to the Node.js runtime. The
  exported function is `proxy`, not `middleware`.
- **Prisma 7 removed `url` from the `datasource` block.** Connection configuration moved to
  `prisma.config.ts` plus a driver adapter, and the generated client is imported from a local
  output path rather than `@prisma/client`.
