import { handler } from "@/server/http/errors";
import { requireUser } from "@/server/auth/require-user";
import { exportOrdersSchema } from "@/lib/schemas/order";
import { listOrdersForExport } from "@/server/services/order-service";
import { serialiseOrder } from "@/server/http/serialise";
import { toCsv } from "@/server/domain/csv";
import { NextResponse, type NextRequest } from "next/server";

export const GET = handler(async (request: NextRequest) => {
  const user = await requireUser();
  const query = exportOrdersSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const orders = await listOrdersForExport(user.id, query);
  const rows = orders.map((order) => {
    const serialised = serialiseOrder(order);
    return [
      serialised.customer,
      serialised.dueDate,
      serialised.status,
      serialised.orderTotal,
      serialised.amountPaid,
      serialised.amountDue,
      String(order.payments.length),
      serialised.createdAt.slice(0, 10),
    ];
  });

  const csv = toCsv(
    ["customer", "due_date", "status", "order_total", "amount_paid", "amount_due", "payment_count", "created_at"],
    rows,
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${query.from}-to-${query.to}.csv"`,
    },
  });
});
