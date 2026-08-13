import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/require-user";
import { getOrder } from "@/server/services/order-service";
import { serialiseOrder } from "@/server/http/serialise";
import { NotFoundError } from "@/server/http/errors";
import { OrderHeader } from "./order-header";
import { PaymentProgress } from "./payment-progress";
import { LineItemsTable } from "./line-items-table";
import { PaymentHistory } from "./payment-history";

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const user = await requireUser();
  const { id } = await params;

  // getOrder throws NotFoundError both for an unknown id and for one that
  // belongs to another user — wired to notFound() so both render the
  // standard 404, matching the API's behaviour from 05-orders-api.md.
  let order;
  try {
    order = serialiseOrder(await getOrder(user.id, id));
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <OrderHeader order={order} />
      <PaymentProgress order={order} />
      <LineItemsTable
        items={order.items}
        total={order.orderTotal}
        isLocked={(order.payments ?? []).length > 0}
      />
      <PaymentHistory payments={order.payments ?? []} orderTotal={order.orderTotal} />
    </main>
  );
}
