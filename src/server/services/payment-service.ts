import { dbSchema, prisma } from "@/server/db/prisma";
import { assertPaymentFits } from "@/server/domain/payment-rules";
import { parseMoneyToCents } from "@/server/domain/money";
import { NotFoundError } from "@/server/http/errors";
import type { CreatePaymentInput } from "@/lib/schemas/order";
import { orderWithRelations, type OrderWithRelations } from "./order-service";

interface LockedOrder {
  id: string;
  total_cents: number;
  paid_cents: number;
}

export async function recordPayment(
  userId: string,
  orderId: string,
  input: CreatePaymentInput,
): Promise<{ order: OrderWithRelations }> {
  const amountCents = parseMoneyToCents(input.amount);

  return prisma.$transaction(
    async (tx) => {
      // Lock the order row. Scoping by userId here means an order belonging to
      // someone else is indistinguishable from one that does not exist.
      //
      // $queryRawUnsafe, not the tagged-template $queryRaw, because this query
      // both needs the schema-qualified table name and binds parameters — see
      // the comment on dbTable() in src/server/db/prisma.ts for why mixing
      // those two in a tagged template breaks with this driver.
      const [order] = await tx.$queryRawUnsafe<LockedOrder[]>(
        `SELECT id, total_cents, paid_cents FROM "${dbSchema}"."orders"
         WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        orderId,
        userId,
      );

      if (!order) throw new NotFoundError("Order");

      // Throws OverpaymentError with the maximum allowed amount attached.
      assertPaymentFits({
        amountCents,
        totalCents: order.total_cents,
        paidCents: order.paid_cents,
      });

      await tx.payment.create({
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

      return { order: updated };
    },
    { isolationLevel: "ReadCommitted", timeout: 10_000 },
  );
}
