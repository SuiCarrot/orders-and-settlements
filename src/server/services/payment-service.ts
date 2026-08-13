import { dbSchema, prisma } from "@/server/db/prisma";
import { assertPaymentFits } from "@/server/domain/payment-rules";
import { parseMoneyToCents } from "@/server/domain/money";
import { eventStatus } from "@/server/domain/order-events";
import { NotFoundError } from "@/server/http/errors";
import type { CreatePaymentInput } from "@/lib/schemas/order";
import { orderWithRelations, type OrderWithRelations } from "./order-service";

interface LockedOrder {
  id: string;
  total_cents: number;
  paid_cents: number;
  due_date: Date;
}

export async function recordPayment(
  userId: string,
  orderId: string,
  input: CreatePaymentInput,
): Promise<{ order: OrderWithRelations }> {
  const amountCents = parseMoneyToCents(input.amount);

  return prisma.$transaction(
    async (tx) => {
      const [order] = await tx.$queryRawUnsafe<LockedOrder[]>(
        `SELECT id, total_cents, paid_cents, due_date FROM "${dbSchema}"."orders"
         WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        orderId,
        userId,
      );

      if (!order) throw new NotFoundError("Order");

      const fromStatus = eventStatus({
        totalCents: order.total_cents,
        paidCents: order.paid_cents,
        dueDate: order.due_date,
      });

      assertPaymentFits({
        amountCents,
        totalCents: order.total_cents,
        paidCents: order.paid_cents,
      });

      const payment = await tx.payment.create({
        data: {
          orderId,
          amountCents,
          paidAt: new Date(`${input.date}T00:00:00Z`),
          note: input.note ?? null,
        },
      });

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { paidCents: { increment: amountCents } },
        ...orderWithRelations,
      });

      await tx.orderEvent.create({
        data: {
          orderId,
          userId,
          type: "payment.recorded",
          fromStatus,
          toStatus: eventStatus(updated),
          payload: { paymentId: payment.id, amountCents: payment.amountCents },
        },
      });

      return {
        order: await tx.order.findFirstOrThrow({ where: { id: orderId }, ...orderWithRelations }),
      };
    },
    { isolationLevel: "ReadCommitted", timeout: 10_000 },
  );
}
