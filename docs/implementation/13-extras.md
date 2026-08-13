# Phase 13 — Stretch goals

**Goal.** The optional features from the assignment, in the order that adds most value per hour.

**Rule.** None of these start until phases 1–12 are complete and committed. A polished core with no
stretch goals scores better than a half-finished audit log attached to a shaky payment path.

Order: audit log, then CSV export, then refunds. If time runs out, say in the README which ones
were skipped and why — a deliberate omission reads very differently from an unfinished feature.

---

## 13.1 — Audit log

**Why first.** It reinforces exactly what the assignment grades: transactional writes and status
transitions. It is also the smallest of the three.

### Model

```prisma
model OrderEvent {
  id         String   @id @default(cuid())
  orderId    String   @map("order_id")
  userId     String   @map("user_id")
  type       String   // order.created | payment.recorded | order.updated
  fromStatus String?  @map("from_status")
  toStatus   String?  @map("to_status")
  payload    Json
  createdAt  DateTime @default(now()) @map("created_at")

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId, createdAt])
  @@map("order_events")
}
```

`payload` is `Json` because event shapes differ and will keep differing. `fromStatus` and
`toStatus` are promoted to columns because they are the fields worth querying.

### The rule that makes it trustworthy

**The event is written inside the same transaction as the change it describes.** Not after, not in
a hook, not fire-and-forget.

```ts
return prisma.$transaction(async (tx) => {
  const order = await lockOrder(tx, userId, orderId);
  const fromStatus = deriveStatus({ ...order, now });

  const payment = await tx.payment.create({ /* ... */ });
  const updated = await tx.order.update({ /* ... */ });

  await tx.orderEvent.create({
    data: {
      orderId,
      userId,
      type: "payment.recorded",
      fromStatus,
      toStatus: deriveStatus({ ...updated, now }),
      payload: { paymentId: payment.id, amountCents: payment.amountCents },
    },
  });

  return { payment, order: updated };
});
```

If the payment rolls back, so does its event. An audit log that can disagree with the data it
audits is worse than no audit log, because it is trusted.

Note that status is *derived* before and after rather than read from a column — the same pure
function the rest of the app uses, so the log cannot record a transition that the UI would not show.

### Surface

A timeline on the order detail page: "Status changed from Pending to Partially paid — Aug 13, 2026,
2:31 PM". No new endpoint needed; it renders from the detail query.

**Estimated effort:** ~1 hour.

---

## 13.2 — CSV export

**Why second.** Small, self-contained, and genuinely useful in a B2B product.

```
GET /api/orders/export?from=2026-01-01&to=2026-12-31&status=overdue
```

Reuses the exact filter logic from [05-orders-api.md](05-orders-api.md), so the export can never
disagree with what the dashboard shows — the same `statusWhere` function, the same `userId` scope.

```ts
export const GET = handler(async (request: NextRequest) => {
  const user = await requireUser();
  const query = exportQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const orders = await listOrdersForExport(user.id, query);

  return new Response(toCsv(orders), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${query.from}-to-${query.to}.csv"`,
    },
  });
});
```

Columns: customer, due date, status, order total, amount paid, amount due, payment count, created
at.

Three details that separate a working export from a correct one:

- **Escape properly.** A customer named `Smith, Jones & Co` must be quoted, and embedded quotes
  doubled. Write the six-line escaper rather than joining with commas.
- **Amounts as plain decimal strings**, no currency symbols or thousands separators. Spreadsheets
  must parse them as numbers.
- **Guard against CSV injection.** A customer name beginning with `=`, `+`, `-` or `@` is executed
  as a formula when opened in Excel. Prefix such values with a single quote. This is a real
  vulnerability class, and catching it is the kind of thing that stands out in a review.

Validate that `from` is not after `to`, and cap the range. An unbounded export is a denial of
service on a serverless function.

**Estimated effort:** ~1 hour.

---

## 13.3 — Refunds

**Why last.** It is the most interesting of the three and by far the largest, because doing it
properly touches the core invariant.

### The wrong way

Allowing a negative `amountCents` in `payments`. It appears to work — the sum still gives the right
balance — but it breaks the `payments_amount_positive` CHECK constraint, makes "total paid" and
"total refunded" indistinguishable without a sign filter scattered through every query, and lets a
refund make `paidCents` negative unless a second constraint is added.

### The right way

A separate `Refund` entity that references the payment it reverses.

```prisma
model Refund {
  id          String   @id @default(cuid())
  paymentId   String   @map("payment_id")
  orderId     String   @map("order_id")
  amountCents Int      @map("amount_cents")
  reason      String
  refundedAt  DateTime @map("refunded_at") @db.Date
  createdAt   DateTime @default(now()) @map("created_at")

  payment Payment @relation(fields: [paymentId], references: [id])
  order   Order   @relation(fields: [orderId], references: [id])

  @@index([orderId])
  @@map("refunds")
}
```

Rules, all enforced inside the same locked transaction as the payment flow:

1. A refund cannot exceed the payment it references, minus refunds already issued against it.
2. `paidCents` is decremented by the refund amount. A partial refund reopens the order
   (`partially_paid`, or `overdue` if past due). A refund that clears `paidCents` derives
   `refunded`, so a reversed order does not fall through to `overdue` just because the due date
   has passed.
3. The refund row is never updated or deleted. A mistaken refund is corrected by a new payment.
4. The `paid_cents >= 0` CHECK constraint keeps the floor.

Both the payment and the refund path lock the same order row, so a refund racing a payment
serialises exactly like two payments do.

### Surface

A refund action on each row of the payment history, a dialog capturing amount and a mandatory
reason, and a combined transaction list showing payments and refunds interleaved with a running
balance.

**Estimated effort:** ~2 hours, and it will surface at least one assumption in the status logic
that the tests do not currently cover. Add the reverse-transition cases to the status matrix in
[04-domain.md](04-domain.md) as part of the work.

---

## Commits

One per feature, so each can be reviewed or reverted independently:

```bash
git commit -am "feat: add order audit log written transactionally"
git commit -am "feat: add csv export for orders by date range"
git commit -am "feat: add refunds as compensating entries"
```
