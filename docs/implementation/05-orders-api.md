# Phase 5 — Orders API

**Goal.** REST CRUD for orders, with one validation layer, one error contract, and per-user scoping
that cannot be bypassed.

**Definition of done.** All five endpoints work against a real database. An order id belonging to
another user returns `404`. Creating an order with a zero quantity returns `400` naming the exact
field.

---

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/orders` | List, filtered by status, paginated |
| `POST` | `/api/orders` | Create with line items |
| `GET` | `/api/orders/:id` | Detail with items and payments |
| `PATCH` | `/api/orders/:id` | Update, subject to the immutability rule |
| `DELETE` | `/api/orders/:id` | Delete, only while unpaid |

Payments live in [06-payments-api.md](06-payments-api.md).

## Step 1 — The error contract

`src/server/http/errors.ts`. Every failure in the application funnels through this file, which is
what makes the API responses consistent without repeating try/catch logic in each handler.

```ts
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthenticatedError } from "@/server/auth/require-user";
import { OverpaymentError } from "@/server/domain/payment-rules";
import { InvalidMoneyError } from "@/server/domain/money";

export class NotFoundError extends Error {
  constructor(resource = "Resource") {
    super(`${resource} not found.`);
  }
}

export class ConflictError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function body(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json(body("UNAUTHENTICATED", "Authentication required."), { status: 401 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      body("VALIDATION_ERROR", "The request body is invalid.", {
        fields: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      }),
      { status: 400 },
    );
  }
  if (error instanceof InvalidMoneyError) {
    return NextResponse.json(body("VALIDATION_ERROR", error.message), { status: 400 });
  }
  if (error instanceof OverpaymentError) {
    return NextResponse.json(body(error.code, error.message, error.details), { status: 409 });
  }
  if (error instanceof ConflictError) {
    return NextResponse.json(body(error.code, error.message, error.details), { status: 409 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json(body("NOT_FOUND", error.message), { status: 404 });
  }

  console.error("Unhandled error", error);
  return NextResponse.json(body("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
}

/** Wraps a route handler so no handler needs its own try/catch. */
export function handler<T extends unknown[]>(
  fn: (...args: T) => Promise<NextResponse>,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
```

The status code choices, documented in the README: `400` means the request was malformed and the
client should fix its payload; `409` means the request was well-formed but conflicts with the
current state of the resource, which is exactly what an overpayment is. Both carry a stable `code`
so clients branch on the code, never on the message text.

Unhandled errors return a generic message. Leaking a Prisma stack trace to a client is an
information disclosure issue, and in a financial context it is the kind of thing that shows up in
a security review.

## Step 2 — Zod schemas

`src/lib/schemas/order.ts`. Shared between route handlers and the React forms, so the client
validates against the same rules the server enforces.

```ts
import { z } from "zod";

const moneyString = z
  .string()
  .regex(/^\d{1,13}(\.\d{1,2})?$/, "Use a decimal amount with up to two places, e.g. \"500.00\".");

export const lineItemSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.int().min(1).max(1_000_000),
  unitPrice: moneyString,
});

export const createOrderSchema = z.object({
  customer: z.string().trim().min(1).max(200),
  dueDate: z.iso.date(), // "2026-08-20"
  items: z.array(lineItemSchema).min(1).max(100),
});

export const updateOrderSchema = z.object({
  customer: z.string().trim().min(1).max(200).optional(),
  dueDate: z.iso.date().optional(),
  items: z.array(lineItemSchema).min(1).max(100).optional(),
});

export const listOrdersSchema = z.object({
  status: z.enum(["pending", "partially_paid", "paid", "overdue", "refunded"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});
```

Amounts arrive as strings and are converted with `parseMoneyToCents` inside the service, so the
transport format and the storage format are decided in exactly one place each.

## Step 3 — Order service

`src/server/services/order-service.ts`. Route handlers do no business logic; they parse, delegate,
and serialise.

```ts
import { prisma } from "@/server/db/prisma";
import { parseMoneyToCents } from "@/server/domain/money";
import { lineTotalCents, orderTotalCents } from "@/server/domain/totals";
import { ConflictError, NotFoundError } from "@/server/http/errors";

export async function createOrder(userId: string, input: CreateOrderInput) {
  const items = input.items.map((item) => {
    const unitPriceCents = parseMoneyToCents(item.unitPrice);
    return {
      description: item.description,
      quantity: item.quantity,
      unitPriceCents,
      lineTotalCents: lineTotalCents({ ...item, unitPriceCents }),
    };
  });

  const totalCents = orderTotalCents(items);
  if (totalCents < 1) {
    throw new ConflictError("An order must total at least $0.01.", "EMPTY_ORDER_TOTAL");
  }

  return prisma.order.create({
    data: {
      userId,
      customer: input.customer,
      dueDate: new Date(`${input.dueDate}T00:00:00Z`),
      totalCents,
      items: { create: items },
    },
    include: { items: true, payments: true },
  });
}
```

`prisma.order.create` with a nested `create` is a single transaction. An order and its line items
are never half-written, so a total can never disagree with the items that produced it.

The date is parsed as `T00:00:00Z` to match the `@db.Date` column and the UTC comparison in
`deriveStatus`. Any other parsing introduces an off-by-one-day bug at the timezone boundary.

### Ownership scoping

Every read is scoped in its `where` clause. There is no fetch-then-check anywhere in the codebase.

```ts
export async function getOrder(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: { items: true, payments: { orderBy: { paidAt: "desc" } } },
  });
  if (!order) throw new NotFoundError("Order");
  return order;
}
```

Because ownership and existence are the same query, another user's order id returns `404` rather
than `403`. That is intentional: a `403` would confirm the id exists, which leaks information about
other tenants.

### Filtering by a derived status

Status is not a column, so the filter is expressed as the SQL equivalent of each branch of
`deriveStatus`. Prisma field references let `paidCents` be compared against `totalCents`.

```ts
import { Prisma } from "@/generated/prisma";

function statusWhere(status: OrderStatus, today: Date): Prisma.OrderWhereInput {
  switch (status) {
    case "paid":
      return { paidCents: { gte: prisma.order.fields.totalCents } };
    case "refunded":
      return { paidCents: 0, refunds: { some: {} } };
    case "overdue":
      return {
        paidCents: { lt: prisma.order.fields.totalCents },
        dueDate: { lt: today },
        NOT: { paidCents: 0, refunds: { some: {} } },
      };
    case "partially_paid":
      return {
        paidCents: { gt: 0, lt: prisma.order.fields.totalCents },
        dueDate: { gte: today },
      };
    case "pending":
      return { paidCents: 0, dueDate: { gte: today }, refunds: { none: {} } };
  }
}
```

The `dueDate: { gte: today }` clauses on `pending` and `partially_paid`, and the refund exclusions
on `pending` and `overdue`, are what make the filters mutually exclusive and consistent with the
precedence rule from [04-domain.md](04-domain.md) — a fully refunded order must not also appear
under `overdue`. The five filters partition the set: the sum of their counts equals the total.

This is also the reason `paidCents` is denormalised. Filtering on a `SUM` over the payments table
would need a `HAVING` clause and could not use an index.

## Step 4 — Serialisation

One function converts a Prisma row into the API shape, so the wire format is defined once.

`src/server/http/serialise.ts`:

```ts
export function serialiseOrder(order: OrderWithRelations, now = new Date()) {
  return {
    id: order.id,
    customer: order.customer,
    dueDate: order.dueDate.toISOString().slice(0, 10),
    status: deriveStatus({ ...order, now }),
    orderTotal: formatCents(order.totalCents),
    amountPaid: formatCents(order.paidCents),
    amountDue: formatCents(amountDueCents(order.totalCents, order.paidCents)),
    items: order.items.map(serialiseItem),
    payments: order.payments?.map(serialisePayment),
    createdAt: order.createdAt.toISOString(),
  };
}
```

`userId` is never serialised. Internal ids do not belong in responses.

## Step 5 — Route handlers

`src/app/api/orders/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { handler } from "@/server/http/errors";
import { createOrderSchema, listOrdersSchema } from "@/lib/schemas/order";
import { createOrder, listOrders } from "@/server/services/order-service";
import { serialiseOrder } from "@/server/http/serialise";

export const GET = handler(async (request: NextRequest) => {
  const user = await requireUser();
  const query = listOrdersSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const { orders, total } = await listOrders(user.id, query);

  return NextResponse.json({
    data: orders.map((order) => serialiseOrder(order)),
    pagination: { page: query.page, perPage: query.perPage, total },
  });
});

export const POST = handler(async (request: NextRequest) => {
  const user = await requireUser();
  const input = createOrderSchema.parse(await request.json());
  const order = await createOrder(user.id, input);

  return NextResponse.json({ data: serialiseOrder(order) }, { status: 201 });
});
```

Every handler is three lines of intent: authenticate, validate, delegate. `handler()` supplies the
error mapping and `requireUser()` supplies the `401`.

## Step 6 — The immutability rule

This is a decision worth documenting explicitly, whichever way it goes.

**Rule.** Once an order has at least one payment, its **line items become read-only**. `customer`
and `dueDate` remain editable. `DELETE` is rejected entirely.

```ts
export async function updateOrder(userId: string, orderId: string, input: UpdateOrderInput) {
  const order = await getOrder(userId, orderId);

  if (input.items && order.payments.length > 0) {
    throw new ConflictError(
      "Line items cannot be changed after a payment has been recorded. " +
        "Cancel the payment first, or create a new order.",
      "ORDER_LOCKED",
      { paymentCount: order.payments.length, amountPaid: formatCents(order.paidCents) },
    );
  }
  // ...
}
```

**Why partial immutability rather than fully read-only.** Editing line items changes `totalCents`,
and `totalCents` is the ceiling that every recorded payment was validated against. Lowering it
below `paidCents` would either violate the CHECK constraint or retroactively turn a valid payment
into an overpayment. Once money has moved against a document, the amounts on that document are
history.

`customer` and `dueDate` do not have that property. A misspelled customer name or a renegotiated
due date are corrections to metadata, not to the amount owed, and a system that forces a user to
void a paid order to fix a typo will simply be worked around.

The stricter alternative — fully read-only after first payment — is defensible and slightly simpler.
It was rejected because it makes the common correction impossible while preventing nothing that the
partial rule does not already prevent. The README records both options and this reasoning.

## Step 7 — Commit

```bash
git commit -am "feat: add orders rest api with validation and ownership scoping"
```
