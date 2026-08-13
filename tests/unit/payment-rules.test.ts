import { describe, expect, it } from "vitest";
import { OverpaymentError, assertPaymentFits } from "@/server/domain/payment-rules";

describe("assertPaymentFits", () => {
  it("accepts a payment for exactly the remaining balance", () => {
    expect(() =>
      assertPaymentFits({ amountCents: 60_000, totalCents: 100_000, paidCents: 40_000 }),
    ).not.toThrow();
  });

  it("rejects a payment one cent over the remaining balance", () => {
    expect(() =>
      assertPaymentFits({ amountCents: 60_001, totalCents: 100_000, paidCents: 40_000 }),
    ).toThrow(OverpaymentError);
  });

  it("rejects any payment against an already-settled order", () => {
    expect(() =>
      assertPaymentFits({ amountCents: 1, totalCents: 100_000, paidCents: 100_000 }),
    ).toThrow(OverpaymentError);
  });

  it("carries the maximum allowed amount in details", () => {
    try {
      assertPaymentFits({ amountCents: 60_001, totalCents: 100_000, paidCents: 40_000 });
      expect.fail("expected assertPaymentFits to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(OverpaymentError);
      expect((error as OverpaymentError).details).toEqual({
        maxAllowedAmount: "600.00",
        orderTotal: "1000.00",
        amountPaid: "400.00",
        attemptedAmount: "600.01",
      });
    }
  });

  it("uses a distinct message when the order is already fully paid", () => {
    try {
      assertPaymentFits({ amountCents: 1, totalCents: 100_000, paidCents: 100_000 });
      expect.fail("expected assertPaymentFits to throw");
    } catch (error) {
      expect((error as OverpaymentError).message).toMatch(/already fully paid/);
    }
  });
});
