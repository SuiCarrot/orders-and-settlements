import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { handler } from "@/server/http/errors";
import { updateOrderSchema } from "@/lib/schemas/order";
import { deleteOrder, getOrder, updateOrder } from "@/server/services/order-service";
import { serialiseOrder } from "@/server/http/serialise";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = handler(async (_request: NextRequest, { params }: RouteParams) => {
  const user = await requireUser();
  const { id } = await params;
  const order = await getOrder(user.id, id);

  return NextResponse.json({ data: serialiseOrder(order) });
});

export const PATCH = handler(async (request: NextRequest, { params }: RouteParams) => {
  const user = await requireUser();
  const { id } = await params;
  const input = updateOrderSchema.parse(await request.json());
  const order = await updateOrder(user.id, id, input);

  return NextResponse.json({ data: serialiseOrder(order) });
});

export const DELETE = handler(async (_request: NextRequest, { params }: RouteParams) => {
  const user = await requireUser();
  const { id } = await params;
  await deleteOrder(user.id, id);

  return new NextResponse(null, { status: 204 });
});
