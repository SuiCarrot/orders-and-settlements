import { addDays } from "date-fns";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { createOrder } from "@/server/services/order-service";
import { recordPayment, recordRefund } from "@/server/services/payment-service";
import { serialiseOrder } from "@/server/http/serialise";
import { ExcessRefundError } from "@/server/domain/refund-rules";
import { NotFoundError } from "@/server/http/errors";
import { TEST_USER_ID } from "./setup";

const today = new Date().toISOString().slice(0, 10);
const futureDate = addDays(new Date(), 7).toISOString().slice(0, 10);

async function makePaidOrder() {
  const order = await createOrder(TEST_USER_ID, {
    customer: "Acme Inc",
    dueDate: futureDate,
    items: [{ description: "Widget", quantity: 2, unitPrice: "500.00" }],
  });
  const { order: paid } = await recordPayment(TEST_USER_ID, order.id, {
    amount: "400.00",
    date: today,
  });
  return paid;
}

describe("recordRefund", () => {
  it("decrements paidCents and reverses derived status", async () => {
    const order = await makePaidOrder();
    expect(serialiseOrder(order).status).toBe("partially_paid");

    const paymentId = order.payments[0].id;
    const { order: after } = await recordRefund(TEST_USER_ID, order.id, paymentId, {
      amount: "400.00",
      date: today,
      reason: "Duplicate payment",
    });

    const serialised = serialiseOrder(after);
    expect(after.paidCents).toBe(0);
    expect(serialised.status).toBe("pending");
    expect(serialised.amountDue).toBe("1000.00");
    expect(after.payments[0].refunds).toHaveLength(1);
    expect(after.events.map((event) => event.type)).toEqual([
      "order.created",
      "payment.recorded",
      "refund.recorded",
    ]);
    expect(after.events[2]).toMatchObject({
      type: "refund.recorded",
      fromStatus: "partially_paid",
      toStatus: "pending",
    });
  });

  it("rejects a refund that exceeds the remaining amount on the payment", async () => {
    const order = await makePaidOrder();
    const paymentId = order.payments[0].id;

    await expect(
      recordRefund(TEST_USER_ID, order.id, paymentId, {
        amount: "400.01",
        date: today,
        reason: "Too much",
      }),
    ).rejects.toBeInstanceOf(ExcessRefundError);
  });

  it("raises NotFoundError for another user's order", async () => {
    const order = await makePaidOrder();
    await expect(
      recordRefund("someone-else", order.id, order.payments[0].id, {
        amount: "1.00",
        date: today,
        reason: "Not mine",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("accepts only one of two concurrent refunds that would exceed the payment", async () => {
    const order = await makePaidOrder();
    const paymentId = order.payments[0].id;

    const results = await Promise.allSettled([
      recordRefund(TEST_USER_ID, order.id, paymentId, {
        amount: "400.00",
        date: today,
        reason: "First",
      }),
      recordRefund(TEST_USER_ID, order.id, paymentId, {
        amount: "400.00",
        date: today,
        reason: "Second",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ExcessRefundError);

    const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(final.paidCents).toBe(0);
    expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(1);
  });
});
