# Phase 4 — Domain

**Goal.** The business rules of the application as pure functions with no knowledge of Prisma,
Next.js, or HTTP, covered by unit tests that run in milliseconds.

**Definition of done.** `npm test` passes with the full status matrix, money round-trip cases, and
overpayment boundaries covered. Nothing in `src/server/domain/` imports from outside that folder.

This phase is written before the API on purpose. Every criterion the assignment actually grades —
line item math, payment totals, status logic, overpayment prevention — lives in these three files.
Getting them right first means the API layer becomes thin plumbing.

---

## Step 1 — `money.ts`

Money never touches a float. Parsing goes straight from the decimal string to an integer using
string manipulation, so `"0.29"` cannot become `28.999999999999996`.

`src/server/domain/money.ts`:

```ts
export class InvalidMoneyError extends Error {
  constructor(public readonly input: string) {
    super(`"${input}" is not a valid monetary amount. Use up to two decimal places, e.g. "1000.00".`);
  }
}

const MONEY_PATTERN = /^-?\d{1,13}(\.\d{1,2})?$/;

/** "1000.5" -> 100050. Rejects anything with more than two decimal places. */
export function parseMoneyToCents(input: string): number {
  const trimmed = input.trim();
  if (!MONEY_PATTERN.test(trimmed)) throw new InvalidMoneyError(input);

  const negative = trimmed.startsWith("-");
  const [whole, fraction = ""] = trimmed.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  return negative ? -cents : cents;
}

/** 100050 -> "1000.50". Always two decimal places, no thousands separator. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
```

Rejecting a third decimal place rather than rounding it is deliberate. A client sending `"10.005"`
either has a bug or a different rounding convention, and silently resolving that disagreement
inside a payment endpoint is how reconciliation breaks. The error tells them what to send instead.

`formatCents` produces the machine-readable form used in API responses. Human formatting with
currency symbols and separators is a display concern and lives in `src/lib/format.ts` using
`Intl.NumberFormat`.

## Step 2 — `totals.ts`

```ts
export interface LineItemInput {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export function lineTotalCents(item: LineItemInput): number {
  return item.quantity * item.unitPriceCents;
}

export function orderTotalCents(items: LineItemInput[]): number {
  return items.reduce((sum, item) => sum + lineTotalCents(item), 0);
}
```

Integer multiplication of an integer quantity by integer cents is exact, and every realistic order
total stays far below `Number.MAX_SAFE_INTEGER` (about $90 trillion), so there is no precision
concern. The assignment defines order total as equal to subtotal, with no order-level tax or
discount; the function is kept separate from `orderTotalCents` in name so that adding a tax line
later has an obvious home.

## Step 3 — `status.ts`

```ts
export type OrderStatus = "pending" | "partially_paid" | "paid" | "overdue";

export interface StatusInput {
  totalCents: number;
  paidCents: number;
  dueDate: Date;
  now: Date;
}

/** Compares calendar days in UTC — an order is overdue only after its due date has passed. */
function isPastDue(dueDate: Date, now: Date): boolean {
  return toUtcDayNumber(now) > toUtcDayNumber(dueDate);
}

function toUtcDayNumber(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function deriveStatus({ totalCents, paidCents, dueDate, now }: StatusInput): OrderStatus {
  if (paidCents >= totalCents) return "paid";
  if (isPastDue(dueDate, now)) return "overdue";
  if (paidCents > 0) return "partially_paid";
  return "pending";
}

export function amountDueCents(totalCents: number, paidCents: number): number {
  return Math.max(0, totalCents - paidCents);
}
```

### The precedence decision

The four statuses in the assignment are not mutually exclusive — an order can simultaneously have
a partial payment and be past its due date. The order of the branches above is the actual business
rule, and the README documents it:

1. **`paid` wins over everything.** An order that was overdue and has since been settled shows as
   `paid`. This is the edge case the assignment explicitly asks about. The reasoning: status
   answers "what do I need to do about this order", and a settled order needs nothing. The history
   of having been late is real information, but it belongs in a `paidLate` flag or an audit log,
   not in a field whose job is to drive a work queue. Listed as an improvement in the roadmap.
2. **`overdue` wins over `partially_paid` and `pending`.** A half-paid order that is past due is
   more urgent than a half-paid order that is not, and collapsing the two would hide it from the
   overdue filter, which is the filter a collections user actually opens.

### Other edge cases to document

- **`now > dueDate` compares whole days in UTC.** An order due 2026-08-13 becomes overdue at
  2026-08-14T00:00:00Z, not at any point during the 13th. The README states the timezone
  assumption; supporting per-user timezones is in the roadmap.
- **A zero-total order would be born `paid`.** Prevented upstream: an order requires at least one
  line item and a total of at least one cent, validated in Zod and by a CHECK constraint.
- **`paidCents > totalCents` is unrepresentable.** The database constraint makes it impossible, so
  `>=` in the first branch is defensive rather than meaningful.

## Step 4 — Overpayment rule

Kept in the domain layer so the same function guards the API, the service, and the tests.

`src/server/domain/payment-rules.ts`:

```ts
import { formatCents } from "./money";

export class OverpaymentError extends Error {
  readonly code = "OVERPAYMENT";

  constructor(
    readonly attemptedCents: number,
    readonly totalCents: number,
    readonly paidCents: number,
  ) {
    const remaining = totalCents - paidCents;
    super(
      remaining === 0
        ? `This order is already fully paid. No further payments can be recorded.`
        : `Payment of $${formatCents(attemptedCents)} exceeds the remaining balance of ` +
            `$${formatCents(remaining)} for this order.`,
    );
  }

  get details() {
    return {
      maxAllowedAmount: formatCents(this.totalCents - this.paidCents),
      orderTotal: formatCents(this.totalCents),
      amountPaid: formatCents(this.paidCents),
      attemptedAmount: formatCents(this.attemptedCents),
    };
  }
}

export function assertPaymentFits(input: {
  amountCents: number;
  totalCents: number;
  paidCents: number;
}): void {
  if (input.amountCents > input.totalCents - input.paidCents) {
    throw new OverpaymentError(input.amountCents, input.totalCents, input.paidCents);
  }
}
```

The error carries the maximum allowed amount as structured data, not just prose. The assignment
asks for an actionable error, and "actionable" means a client can render a "pay the remaining
$600.00" button without parsing an English sentence.

## Step 5 — Tests

`tests/unit/status.test.ts` — the full matrix, written as a table so a reviewer can read the rule
off the test:

| paid | total | due date | expected |
|------|-------|----------|----------|
| 0 | 1000 | future | `pending` |
| 0 | 1000 | today | `pending` |
| 0 | 1000 | past | `overdue` |
| 400 | 1000 | future | `partially_paid` |
| 400 | 1000 | past | `overdue` |
| 1000 | 1000 | future | `paid` |
| 1000 | 1000 | past | `paid` |
| 999 | 1000 | one day past | `overdue` |

```ts
describe.each([
  [0, 100_000, "2026-09-01", "pending"],
  [0, 100_000, "2026-08-13", "pending"],
  [0, 100_000, "2026-08-12", "overdue"],
  [40_000, 100_000, "2026-09-01", "partially_paid"],
  [40_000, 100_000, "2026-08-12", "overdue"],
  [100_000, 100_000, "2026-09-01", "paid"],
  [100_000, 100_000, "2026-08-12", "paid"],
] as const)("paid=%i total=%i due=%s", (paidCents, totalCents, due, expected) => {
  it(`is ${expected}`, () => {
    expect(
      deriveStatus({
        paidCents,
        totalCents,
        dueDate: new Date(`${due}T00:00:00Z`),
        now: new Date("2026-08-13T12:00:00Z"),
      }),
    ).toBe(expected);
  });
});
```

`tests/unit/money.test.ts` — round trips (`"0.01"`, `"1000.00"`, `"1000.5"`, `"0.00"`), rejections
(`"10.005"`, `"1,000.00"`, `"abc"`, `""`, `"1e3"`), and the case that motivates the whole approach:
summing `"0.10"` and `"0.20"` yields exactly `"0.30"`.

`tests/unit/totals.test.ts` — the assignment's own scenario, two units at $500 giving exactly
$1,000, plus multi-line orders and quantity of one.

`tests/unit/payment-rules.test.ts` — exact-remainder payment accepted, one cent over rejected, any
payment against a settled order rejected, and the `details` payload carrying the right maximum.

## Step 6 — Commit

```bash
git commit -am "feat: add money, totals and status domain modules with unit tests"
```
