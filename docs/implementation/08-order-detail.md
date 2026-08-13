# Phase 8 — Order detail and payment flow

**Goal.** The order detail page with line items and full payment history, plus the form that
records a payment and handles rejection well.

**Definition of done.** Recording a payment updates status and amount due without a full page
reload. Attempting to overpay shows the maximum allowed amount and offers to fill it in.

---

## Step 1 — The page

`src/app/(app)/orders/[id]/page.tsx`:

```tsx
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const order = serialiseOrder(await getOrder(user.id, id));

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <OrderHeader order={order} />
      <PaymentProgress order={order} />
      <LineItemsTable items={order.items} total={order.orderTotal} />
      <PaymentHistory payments={order.payments} />
    </main>
  );
}
```

`getOrder` throws `NotFoundError` for an id that does not exist *or* belongs to another user. Wire
it to `notFound()` so the page renders the standard 404 rather than a stack trace, keeping the UI
consistent with the API's behaviour from [05-orders-api.md](05-orders-api.md).

## Step 2 — Line items

A plain table: description, quantity, unit price, line total, with the order total in the footer.

Show the computed line total per row even though it equals quantity times unit price. This is the
page where a user verifies the arithmetic, and making them do the multiplication in their head is
exactly the kind of small friction that turns "line item math" from correct into unusable.

When the order is locked because a payment exists, show a quiet note next to the heading:

> Line items are locked because a payment has been recorded.

Stating the rule where the user would otherwise try to break it is better than a disabled button
with no explanation. The rule itself is in [05-orders-api.md](05-orders-api.md).

## Step 3 — Payment progress

A single bar with the paid fraction, and three figures underneath: order total, amount paid, amount
due. It is the fastest way to answer "where does this order stand" and it makes the partially-paid
state legible at a glance.

```tsx
const paidRatio = Number(order.amountPaid) / Number(order.orderTotal);
```

This is the one place a monetary string is converted to a `Number`, and it is safe because the
result drives a CSS width and never returns to the server.

## Step 4 — Payment history

Reverse chronological: date, amount, note, and when it was recorded. Include a running balance
column so a user can trace how the order reached its current state — that is the whole reason a
payment history exists rather than just a total.

Empty state: "No payments recorded yet."

## Step 5 — The payment dialog

A shadcn `Dialog` with a form for amount, date and optional note. shadcn deprecated the RHF-coupled
`Form` wrapper in October 2025 — see the note in [01-scaffold.md](01-scaffold.md) — so the form is
built directly on `react-hook-form`'s `Controller`, with the `Field` family providing accessible
layout (label association, description, error text) independent of any form library.

```tsx
"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { paymentFormSchema, type PaymentFormValues } from "@/lib/schemas/order";

export function RecordPaymentDialog({ order }: { order: SerialisedOrder }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [apiError, setApiError] = useState<ApiError | null>(null);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting },
  } = useForm({
    resolver: zodResolver(paymentFormSchema), // let the resolver infer input/output — see below
    defaultValues: { amount: order.amountDue, date: todayIsoDate(), note: "" },
  });

  async function onSubmit(values: PaymentFormValues) {
    setApiError(null);

    const response = await fetch(`/api/orders/${order.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      setApiError((await response.json()).error);
      return;
    }

    setOpen(false);
    toast.success(`Payment of ${currency(values.amount)} recorded.`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={order.amountDue === "0.00"}>
          {order.amountDue === "0.00" ? "Fully paid" : "Record payment"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              control={control}
              name="amount"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel htmlFor="amount">Amount</FieldLabel>
                  <Input id="amount" {...field} aria-invalid={!!fieldState.error} />
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />
            <Controller
              control={control}
              name="date"
              render={({ field, fieldState }) => (
                <Field data-invalid={!!fieldState.error}>
                  <FieldLabel htmlFor="date">Date</FieldLabel>
                  <Input id="date" type="date" {...field} aria-invalid={!!fieldState.error} />
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />
            {/* note field follows the same pattern */}
          </FieldGroup>

          {apiError?.code === "OVERPAYMENT" && (
            <OverpaymentAlert error={apiError} onUseMax={(max) => setValue("amount", max)} />
          )}

          <Button type="submit" disabled={isSubmitting}>
            Record payment
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

`Controller` is used for every field, including the plain text `Input`, rather than mixing it with
RHF's `register()`. shadcn's inputs are otherwise uncontrolled-by-default; being consistent about
`Controller` everywhere keeps the binding pattern uniform across the form rather than having two
different mental models to debug.

`router.refresh()` re-runs the server component with fresh data, so status, progress bar and
history all update from one source of truth. No client-side cache to invalidate and no chance of
the UI disagreeing with the database.

### Client-side conveniences

- **Prefill the amount with the remaining balance** and offer a "Pay full remaining balance"
  shortcut. The most common action should be one click.
- **Default the date to today.**
- **Disable the trigger entirely when `amountDue` is `"0.00"`**, with the button labelled "Fully
  paid". Preventing the impossible action beats explaining the rejection.
- **Guard against double submission** with the pending state. This is the client-side half of the
  concurrency problem — the server-side half is already handled in
  [06-payments-api.md](06-payments-api.md), and both are needed: the button stops the accident, the
  lock stops the race.

### Form typing with Zod 4

Zod 4 separates a schema's input type from its output type. Any schema using `.default()`,
`.coerce`, or a transform produces a `z.input` that differs from its `z.output`, and
`zodResolver` infers both independently.

The consequence is counter-intuitive, and it is the opposite of the habit built up with Zod 3:

```tsx
// Breaks on any schema with .default() or .coerce — pins input and output to the same type.
useForm<z.infer<typeof paymentFormSchema>>({ resolver: zodResolver(paymentFormSchema) });

// Correct: let the resolver infer.
useForm({ resolver: zodResolver(paymentFormSchema) });

// Or state all three explicitly when a generic is genuinely needed.
useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
  resolver: zodResolver(schema),
});
```

The failure is a TypeScript error, not a runtime bug, so it surfaces immediately. It is worth
knowing in advance only because the instinctive fix — reaching for `z.infer` — is what causes it.

The schemas most affected here are the ones with defaults and coercion, such as
`listOrdersSchema` in [05-orders-api.md](05-orders-api.md). Those are parsed server-side rather
than bound to a form, so in practice the form schemas stay simple; keep them that way.

### Handling rejection

The error contract from [05-orders-api.md](05-orders-api.md) is what makes this good rather than a
generic red box:

```tsx
{error?.code === "OVERPAYMENT" && (
  <Alert variant="destructive">
    <AlertTitle>Payment exceeds the balance due</AlertTitle>
    <AlertDescription>
      {error.message}
      <Button variant="link" onClick={() => setAmount(error.details.maxAllowedAmount)}>
        Use {currency(error.details.maxAllowedAmount)} instead
      </Button>
    </AlertDescription>
  </Alert>
)}
```

The structured `maxAllowedAmount` in the response becomes a button that fixes the problem. That is
what "actionable error" means here, and it is only possible because the API returns the number as
data rather than embedding it in a sentence.

Validation errors (`code === "VALIDATION_ERROR"`) map back onto their fields using the `fields`
array from the response, so "Payment must be at least $0.01" appears under the amount input rather
than at the top of the form.

## Step 6 — Create order form

The counterpart on `/orders/new`: customer, due date, and a repeatable line item row with add and
remove. Show the running subtotal as items change, computed with the same `orderTotalCents` from
[04-domain.md](04-domain.md) so the preview cannot disagree with what the server stores.

Validate with `createOrderSchema` on the client for immediate feedback, knowing the server
re-validates with the identical schema.

## Step 7 — Commit

```bash
git commit -am "feat: add order detail page with payment recording flow"
```
