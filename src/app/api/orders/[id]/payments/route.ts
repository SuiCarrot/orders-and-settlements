import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { handler } from "@/server/http/errors";
import { createPaymentSchema } from "@/lib/schemas/order";
import { recordPayment } from "@/server/services/payment-service";
import { serialiseOrder } from "@/server/http/serialise";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = handler(async (request: NextRequest, { params }: RouteParams) => {
  const user = await requireUser();
  const { id } = await params;
  const input = createPaymentSchema.parse(await request.json());

  const { order } = await recordPayment(user.id, id, input);

  return NextResponse.json({ data: serialiseOrder(order) }, { status: 201 });
});
