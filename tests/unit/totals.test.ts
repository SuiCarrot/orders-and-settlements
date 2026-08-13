import { describe, expect, it } from "vitest";
import { lineTotalCents, orderTotalCents } from "@/server/domain/totals";

describe("lineTotalCents", () => {
  it("multiplies quantity by unit price", () => {
    expect(lineTotalCents({ description: "Widget", quantity: 2, unitPriceCents: 50_000 })).toBe(
      100_000,
    );
  });

  it("handles a quantity of one", () => {
    expect(lineTotalCents({ description: "Widget", quantity: 1, unitPriceCents: 12_345 })).toBe(
      12_345,
    );
  });
});

describe("orderTotalCents", () => {
  it("matches the assignment's own scenario: two units at $500 = $1,000", () => {
    expect(
      orderTotalCents([{ description: "Widget", quantity: 2, unitPriceCents: 50_000 }]),
    ).toBe(100_000);
  });

  it("sums multiple line items", () => {
    expect(
      orderTotalCents([
        { description: "Widget", quantity: 2, unitPriceCents: 50_000 },
        { description: "Gadget", quantity: 3, unitPriceCents: 1_000 },
      ]),
    ).toBe(103_000);
  });

  it("returns 0 for no line items", () => {
    expect(orderTotalCents([])).toBe(0);
  });
});
