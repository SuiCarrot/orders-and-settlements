import { addDays } from "date-fns";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { createOrder } from "@/server/services/order-service";
import { recordPayment } from "@/server/services/payment-service";
import { serialiseOrder } from "@/server/http/serialise";
import { OverpaymentError } from "@/server/domain/payment-rules";
import { NotFoundError } from "@/server/http/errors";
import { TEST_USER_ID } from "./setup";

const today = new Date().toISOString().slice(0, 10);
const futureDate = addDays(new Date(), 7).toISOString().slice(0, 10);

function makeOrder(userId = TEST_USER_ID) {
  return createOrder(userId, {
    customer: "Acme Inc",
    dueDate: futureDate,
    items: [{ description: "Widget", quantity: 2, unitPrice: "500.00" }],
  });
}

describe("recordPayment", () => {
  it("follows the assignment scenario end to end", async () => {
    const order = await makeOrder();
    expect(order.totalCents).toBe(100_000);

    const first = await recordPayment(TEST_USER_ID, order.id, { amount: "400.00", date: today });
    const firstSerialised = serialiseOrder(first.order);
    expect(firstSerialised.status).toBe("partially_paid");
    expect(firstSerialised.amountDue).toBe("600.00");

    const second = await recordPayment(TEST_USER_ID, order.id, { amount: "600.00", date: today });
    const secondSerialised = serialiseOrder(second.order);
    expect(secondSerialised.status).toBe("paid");
    expect(secondSerialised.amountDue).toBe("0.00");

    await expect(
      recordPayment(TEST_USER_ID, order.id, { amount: "1.00", date: today }),
    ).rejects.toBeInstanceOf(OverpaymentError);
  });

  it("accepts a payment for exactly the remaining balance", async () => {
    const order = await makeOrder();
    const { order: paid } = await recordPayment(TEST_USER_ID, order.id, {
      amount: "1000.00",
      date: today,
    });
    expect(paid.paidCents).toBe(100_000);
    expect(serialiseOrder(paid).status).toBe("paid");
  });

  it("raises NotFoundError for another user's order", async () => {
    const order = await makeOrder();
    await expect(
      recordPayment("someone-else", order.id, { amount: "100.00", date: today }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("accepts only one of two concurrent payments that would overpay", async () => {
    const order = await makeOrder();

    const results = await Promise.allSettled([
      recordPayment(TEST_USER_ID, order.id, { amount: "600.00", date: today }),
      recordPayment(TEST_USER_ID, order.id, { amount: "600.00", date: today }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(OverpaymentError);

    const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(final.paidCents).toBe(60_000);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
  });
});
