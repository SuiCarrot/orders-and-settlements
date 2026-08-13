import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/require-user";
import { getOrderSummary, listOrders } from "@/server/services/order-service";
import { listOrdersSchema } from "@/lib/schemas/order";
import { serialiseOrder } from "@/server/http/serialise";
import { Button } from "@/components/ui/button";
import { StatusFilter } from "./status-filter";
import { SummaryCards } from "./summary-cards";
import { OrdersTable } from "./orders-table";
import { Pagination } from "./pagination";

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requireUser();
  const query = listOrdersSchema.parse(await searchParams);

  const [{ orders, total }, summary] = await Promise.all([
    listOrders(user.id, query),
    getOrderSummary(user.id),
  ]);

  // A page beyond the last (e.g. after a filter change shrinks the result
  // set) redirects back to page one instead of rendering a confusing blank
  // table with working pagination controls that go nowhere.
  const totalPages = Math.max(1, Math.ceil(total / query.perPage));
  if (query.page > totalPages) {
    const params = new URLSearchParams();
    if (query.status) params.set("status", query.status);
    redirect(`/dashboard?${params.toString()}`);
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <Button render={<Link href="/orders/new" />}>New order</Button>
      </div>

      <SummaryCards summary={summary} />
      <StatusFilter active={query.status} />
      <OrdersTable
        orders={orders.map((order) => serialiseOrder(order))}
        hasAnyOrders={summary.orderCount > 0}
        activeStatus={query.status}
      />
      <Pagination page={query.page} perPage={query.perPage} total={total} status={query.status} />
    </main>
  );
}
