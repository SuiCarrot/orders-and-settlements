# Phase 9 — Seed and scenario verification

**Goal.** A one-command seed that gives a reviewer a populated dashboard on first login, and an
executable check that the assignment's scenario behaves exactly as specified.

**Definition of done.** `npm run db:seed` produces a demo account with at least one order in each
status. `npm run verify:scenario` runs the four steps from the assignment against a live server and
exits non-zero on any deviation.

A reviewer with limited time will log in before reading any code. An empty dashboard wastes that
first impression.

---

## Step 1 — Creating the demo user

The seed must not insert a user row directly, because password hashing is Better Auth's
responsibility and a hand-written hash will not match its verification. Go through the API:

```ts
import { auth } from "@/server/auth/auth";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo-password-123";

async function ensureDemoUser() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) return existing;

  await auth.api.signUpEmail({
    body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "Demo User" },
  });

  return prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } });
}
```

The seed is idempotent: running it twice does not create a second demo user or duplicate orders.
Deletion is scoped to the demo user's own rows, never a blanket `deleteMany()`, so running the seed
against a database that has real data cannot wipe it.

## Step 2 — Covering every status

Data is generated relative to today so the fixture never expires — a hard-coded 2026 due date turns
every order overdue by the time someone reviews it.

| Customer | Line items | Payments | Due | Resulting status |
|----------|-----------|----------|-----|------------------|
| Acme Inc | 2 × $500.00 | none | +7 days | `pending` |
| Globex Corporation | 1 × $2,400.00, 3 × $150.00 | $1,000.00 | +14 days | `partially_paid` |
| Initech | 1 × $750.00 | $250.00, $500.00 | +3 days | `paid` |
| Umbrella Health | 4 × $325.50 | none | −5 days | `overdue` |
| Stark Industries | 2 × $1,200.00 | $600.00 | −12 days | `overdue`, partially paid |
| Wayne Enterprises | 1 × $89.99 | $89.99 | −20 days | `paid`, settled after due date |

The last two rows exist specifically to demonstrate the precedence decisions from
[04-domain.md](04-domain.md): a partially paid order past its due date reads `overdue`, and an
order settled after its due date reads `paid`. They are the edge cases the assignment asks to be
documented, so the seed makes them clickable rather than hypothetical.

Note `$325.50 × 4 = $1,302.00`, which is exact in cents and would land on `1302.0000000000002` if
computed in floats. A deliberate fixture for the precision decision.

## Step 3 — Seeding through the services

```ts
for (const fixture of FIXTURES) {
  const order = await createOrder(user.id, {
    customer: fixture.customer,
    dueDate: offsetDate(fixture.dueInDays),
    items: fixture.items,
  });

  for (const payment of fixture.payments) {
    await recordPayment(user.id, order.id, payment);
  }
}
```

Seeding through `createOrder` and `recordPayment` rather than raw `prisma.create` calls means the
seed exercises the same validation, the same total computation and the same overpayment guard as
production traffic. A fixture that violates a business rule fails the seed instead of quietly
creating impossible data — which has the useful side effect of making the seed a smoke test.

## Step 4 — Scenario verification script

`scripts/verify-scenario.ts` runs the assignment's flow against a running server over HTTP, so it
tests the actual API contract, status codes and error bodies rather than the service layer.

```ts
const steps = [
  { label: "Create order: 2 × $500.00, due in 7 days", run: createOrder },
  { label: "Record $400.00 → partially_paid, $600.00 due", run: firstPayment },
  { label: "Record $600.00 → paid, $0.00 due", run: secondPayment },
  { label: "Reject $1.00 with an actionable error", run: rejectedPayment },
];
```

Step four asserts the full contract, not just the failure:

```ts
assert.equal(response.status, 409);
assert.equal(body.error.code, "OVERPAYMENT");
assert.equal(body.error.details.maxAllowedAmount, "0.00");
assert.match(body.error.message, /already fully paid/i);

const after = await getOrder();
assert.equal(after.amountPaid, "1000.00"); // the rejected payment left no trace
```

The last assertion is the one that matters. A rejection that still wrote a row would pass a
naive test.

Output is a checklist, so it can be pasted into the README or a submission email:

```
✔ Create order: 2 × $500.00, due in 7 days      total $1,000.00
✔ Record $400.00                                 partially_paid, $600.00 due
✔ Record $600.00                                 paid, $0.00 due
✔ Reject $1.00                                   409 OVERPAYMENT, max allowed $0.00

4/4 passed
```

Point it at the deployed URL with `BASE_URL=https://... npm run verify:scenario` to prove the live
deployment behaves identically.

## Step 5 — Commit

```bash
git commit -am "feat: add seed data and assignment scenario verification script"
```
