import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { handler } from "@/server/http/errors";
import { createRefundSchema } from "@/lib/schemas/order";
import { recordRefund } from "@/server/services/payment-service";
import { serialiseOrder } from "@/server/http/serialise";

interface RouteParams {
  params: Promise<{ id: string; paymentId: string }>;
}

export const POST = handler(async (request: NextRequest, { params }: RouteParams) => {
  const user = await requireUser();
  const { id, paymentId } = await params;
  const input = createRefundSchema.parse(await request.json());

  const { order } = await recordRefund(user.id, id, paymentId, input);

  return NextResponse.json({ data: serialiseOrder(order) }, { status: 201 });
});
