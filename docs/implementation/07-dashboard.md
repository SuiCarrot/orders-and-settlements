# Phase 7 — Dashboard

**Goal.** The order list the assignment specifies: customer, status, order total, amount paid,
amount due and due date, filterable by status.

**Definition of done.** The list renders every required column, the status filter is shareable as a
URL, and an account with no orders sees a useful empty state rather than an empty table.

---

## Step 1 — Data access from the server component

The page reads through the service layer directly rather than fetching its own API over HTTP. A
server component calling `fetch("/api/orders")` on the same server adds a network round trip, loses
type safety, and forces the session cookie to be forwarded manually.

The REST API still exists and is fully functional — the assignment requires it, and it is what the
`curl` examples in the README exercise. It just is not the transport for the app's own first paint.

`src/app/(app)/dashboard/page.tsx`:

```tsx
import { requireUser } from "@/server/auth/require-user";
import { listOrders } from "@/server/services/order-service";
import { listOrdersSchema } from "@/lib/schemas/order";
import { serialiseOrder } from "@/server/http/serialise";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const query = listOrdersSchema.parse(await searchParams);
  const { orders, total } = await listOrders(user.id, query);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <DashboardHeader totals={await getSummary(user.id)} />
      <StatusFilter active={query.status} />
      <OrdersTable orders={orders.map((o) => serialiseOrder(o))} />
      <Pagination page={query.page} perPage={query.perPage} total={total} />
    </main>
  );
}
```

`requireUser()` runs here as well as in `proxy.ts`. The proxy is an optimistic redirect; this is the
authorization. See [03-auth.md](03-auth.md).

The same `listOrdersSchema` validates `searchParams` as validates the API query string, so a
hand-edited URL such as `?status=nonsense` fails the same way in both places.

## Step 2 — Status filter

Filter state lives in the URL, not in React state. `/dashboard?status=overdue` is then shareable,
bookmarkable, survives a refresh, and needs no client-side data fetching.

```tsx
"use client";

const STATUSES = [
  { value: undefined, label: "All" },
  { value: "pending", label: "Pending" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
] as const;

export function StatusFilter({ active }: { active?: OrderStatus }) {
  const router = useRouter();
  const params = useSearchParams();

  function select(status?: string) {
    const next = new URLSearchParams(params);
    status ? next.set("status", status) : next.delete("status");
    next.delete("page"); // a new filter always starts on page one
    router.push(`/dashboard?${next}`);
  }
  // renders a row of toggle buttons
}
```

Resetting `page` when the filter changes prevents the empty-page-three problem, which is the most
common bug in filtered lists.

## Step 3 — The table

Columns are exactly the ones the assignment lists, in that order.

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Customer</TableHead>
      <TableHead>Status</TableHead>
      <TableHead className="text-right">Order total</TableHead>
      <TableHead className="text-right">Amount paid</TableHead>
      <TableHead className="text-right">Amount due</TableHead>
      <TableHead>Due date</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {orders.map((order) => (
      <TableRow key={order.id} onClick={() => router.push(`/orders/${order.id}`)}>
        <TableCell className="font-medium">{order.customer}</TableCell>
        <TableCell><StatusBadge status={order.status} /></TableCell>
        <TableCell className="text-right tabular-nums">{currency(order.orderTotal)}</TableCell>
        <TableCell className="text-right tabular-nums">{currency(order.amountPaid)}</TableCell>
        <TableCell className="text-right tabular-nums font-medium">
          {currency(order.amountDue)}
        </TableCell>
        <TableCell><DueDate date={order.dueDate} status={order.status} /></TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

Small things that make a financial table readable, and that a reviewer scoring "dashboard
usability" will register:

- **`tabular-nums` and right alignment on money.** Proportional digits make columns of numbers
  impossible to scan.
- **Amount due is emphasised.** It is the number the user came for.
- **Dates render as `Aug 20, 2026`**, never as a locale-dependent `08/20/2026` that means something
  different to half the world. An overdue date also shows a relative hint — "5 days ago".
- **The whole row is a link** to the detail page, with a real anchor on the customer cell so
  middle-click and keyboard navigation work.

`currency()` in `src/lib/format.ts` wraps `Intl.NumberFormat` and takes the decimal string from the
API — display formatting is the only place a monetary value becomes a `Number`, and it never flows
back into a write.

## Step 4 — Status badges

```tsx
const VARIANTS: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-slate-100 text-slate-700" },
  partially_paid: { label: "Partially paid", className: "bg-amber-100 text-amber-800" },
  paid: { label: "Paid", className: "bg-emerald-100 text-emerald-800" },
  overdue: { label: "Overdue", className: "bg-red-100 text-red-800" },
};
```

Colour is never the only signal — each badge carries its label as text, so the table is readable
without colour vision.

## Step 5 — Summary cards

A small header showing total outstanding, overdue amount, and order count. It costs one aggregate
query and immediately answers the question a user opens this page to ask.

```ts
const [outstanding, overdue] = await Promise.all([
  prisma.order.aggregate({
    where: { userId },
    _sum: { totalCents: true, paidCents: true },
  }),
  prisma.order.aggregate({
    where: { userId, dueDate: { lt: today }, paidCents: { lt: prisma.order.fields.totalCents } },
    _sum: { totalCents: true, paidCents: true },
  }),
]);
```

## Step 6 — Pagination and empty states

Offset pagination with `skip`/`take`. Cursor pagination would be the right answer at scale and is
noted in the roadmap; at this size it would be over-engineering.

Three distinct empty states, because they need three different messages:

- **No orders at all** — an illustration and a "Create your first order" call to action.
- **No orders matching the filter** — "No overdue orders" with a button to clear the filter. This is
  good news, not an error, and should not look like one.
- **Page beyond the last** — redirect back to page one.

## Step 7 — Commit

```bash
git commit -am "feat: add orders dashboard with status filter and summary"
```
