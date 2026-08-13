import { describe, expect, it } from "vitest";
import { ExcessRefundError, assertRefundFits } from "@/server/domain/refund-rules";

describe("assertRefundFits", () => {
  it("accepts a refund for exactly the remaining amount on the payment", () => {
    expect(() =>
      assertRefundFits({
        amountCents: 40_000,
        paymentAmountCents: 40_000,
        alreadyRefundedCents: 0,
        orderPaidCents: 40_000,
      }),
    ).not.toThrow();
  });

  it("rejects a refund one cent over the remaining amount on the payment", () => {
    expect(() =>
      assertRefundFits({
        amountCents: 40_001,
        paymentAmountCents: 40_000,
        alreadyRefundedCents: 0,
        orderPaidCents: 100_000,
      }),
    ).toThrow(ExcessRefundError);
  });

  it("rejects any refund against an already fully refunded payment", () => {
    expect(() =>
      assertRefundFits({
        amountCents: 1,
        paymentAmountCents: 40_000,
        alreadyRefundedCents: 40_000,
        orderPaidCents: 60_000,
      }),
    ).toThrow(ExcessRefundError);
  });

  it("cannot refund more than the order's current paid balance", () => {
    expect(() =>
      assertRefundFits({
        amountCents: 40_000,
        paymentAmountCents: 40_000,
        alreadyRefundedCents: 0,
        orderPaidCents: 10_000,
      }),
    ).toThrow(ExcessRefundError);
  });

  it("carries the maximum allowed amount in details", () => {
    try {
      assertRefundFits({
        amountCents: 40_001,
        paymentAmountCents: 40_000,
        alreadyRefundedCents: 0,
        orderPaidCents: 40_000,
      });
      expect.fail("expected assertRefundFits to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ExcessRefundError);
      expect((error as ExcessRefundError).details).toEqual({
        maxAllowedAmount: "400.00",
        paymentAmount: "400.00",
        alreadyRefunded: "0.00",
        amountPaid: "400.00",
        attemptedAmount: "400.01",
      });
    }
  });
});
