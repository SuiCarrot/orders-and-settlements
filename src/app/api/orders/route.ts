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
