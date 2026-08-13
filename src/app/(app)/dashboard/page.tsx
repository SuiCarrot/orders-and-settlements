import Link from "next/link";
import { requireUser } from "@/server/auth/require-user";
import { getOrderSummary, listOrders } from "@/server/services/order-service";
import { listOrdersSchema } from "@/lib/schemas/order";
import { serialiseOrder } from "@/server/http/serialise";
import { todayIsoDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { SummaryCards } from "./summary-cards";
import { OrdersBoard } from "./orders-board";

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requireUser();
  const query = listOrdersSchema.parse(await searchParams);

  // Load the unfiltered list once. Status tabs filter in the browser — see
  // orders-board.tsx. The REST API still filters server-side for API clients.
  const [{ orders }, summary] = await Promise.all([
    listOrders(user.id, { page: 1, perPage: 100 }),
    getOrderSummary(user.id),
  ]);

  const yearStart = `${new Date().getUTCFullYear()}-01-01`;
  const exportHref = `/api/orders/export?from=${yearStart}&to=${todayIsoDate()}`;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <div className="flex gap-2">
          <Button variant="outline" render={<a href={exportHref} />}>
            Export CSV
          </Button>
          <Button render={<Link href="/orders/new" />}>New order</Button>
        </div>
      </div>

      <SummaryCards summary={summary} />
      <OrdersBoard
        orders={orders.map((order) => serialiseOrder(order))}
        hasAnyOrders={summary.orderCount > 0}
        initialStatus={query.status}
        initialPage={query.page}
        perPage={query.perPage}
      />
    </main>
  );
}
