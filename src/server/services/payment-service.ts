import { Prisma } from "@/generated/prisma";
import { dbSchema, prisma } from "@/server/db/prisma";
import { assertPaymentFits } from "@/server/domain/payment-rules";
import { assertRefundFits } from "@/server/domain/refund-rules";
import { parseMoneyToCents } from "@/server/domain/money";
import { eventStatus } from "@/server/domain/order-events";
import { NotFoundError } from "@/server/http/errors";
import type { CreatePaymentInput, CreateRefundInput } from "@/lib/schemas/order";
import { orderWithRelations, type OrderWithRelations } from "./order-service";

interface LockedOrder {
  id: string;
  total_cents: number;
  paid_cents: number;
  due_date: Date;
}

async function lockOrder(
  tx: Prisma.TransactionClient,
  userId: string,
  orderId: string,
): Promise<LockedOrder> {
  const [order] = await tx.$queryRawUnsafe<LockedOrder[]>(
    `SELECT id, total_cents, paid_cents, due_date FROM "${dbSchema}"."orders"
     WHERE id = $1 AND user_id = $2 FOR UPDATE`,
    orderId,
    userId,
  );

  if (!order) throw new NotFoundError("Order");
  return order;
}

export async function recordPayment(
  userId: string,
  orderId: string,
  input: CreatePaymentInput,
): Promise<{ order: OrderWithRelations }> {
  const amountCents = parseMoneyToCents(input.amount);

  return prisma.$transaction(
    async (tx) => {
      const order = await lockOrder(tx, userId, orderId);

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

export async function recordRefund(
  userId: string,
  orderId: string,
  paymentId: string,
  input: CreateRefundInput,
): Promise<{ order: OrderWithRelations }> {
  const amountCents = parseMoneyToCents(input.amount);

  return prisma.$transaction(
    async (tx) => {
      const order = await lockOrder(tx, userId, orderId);

      const payment = await tx.payment.findFirst({
        where: { id: paymentId, orderId },
        include: { refunds: true },
      });
      if (!payment) throw new NotFoundError("Payment");

      const alreadyRefundedCents = payment.refunds.reduce(
        (sum, refund) => sum + refund.amountCents,
        0,
      );

      const fromStatus = eventStatus({
        totalCents: order.total_cents,
        paidCents: order.paid_cents,
        dueDate: order.due_date,
      });

      assertRefundFits({
        amountCents,
        paymentAmountCents: payment.amountCents,
        alreadyRefundedCents,
        orderPaidCents: order.paid_cents,
      });

      const refund = await tx.refund.create({
        data: {
          paymentId,
          orderId,
          amountCents,
          reason: input.reason,
          refundedAt: new Date(`${input.date}T00:00:00Z`),
        },
      });

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { paidCents: { decrement: amountCents } },
        ...orderWithRelations,
      });

      await tx.orderEvent.create({
        data: {
          orderId,
          userId,
          type: "refund.recorded",
          fromStatus,
          toStatus: eventStatus(updated),
          payload: {
            refundId: refund.id,
            paymentId,
            amountCents: refund.amountCents,
            reason: refund.reason,
          },
        },
      });

      return {
        order: await tx.order.findFirstOrThrow({ where: { id: orderId }, ...orderWithRelations }),
      };
    },
    { isolationLevel: "ReadCommitted", timeout: 10_000 },
  );
}
