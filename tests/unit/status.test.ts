import { describe, expect, it } from "vitest";
import { amountDueCents, deriveStatus } from "@/server/domain/status";

describe.each([
  [0, 100_000, "2026-09-01", "pending"],
  [0, 100_000, "2026-08-13", "pending"],
  [0, 100_000, "2026-08-12", "overdue"],
  [40_000, 100_000, "2026-09-01", "partially_paid"],
  [40_000, 100_000, "2026-08-12", "overdue"],
  [100_000, 100_000, "2026-09-01", "paid"],
  [100_000, 100_000, "2026-08-12", "paid"],
  [99_900, 100_000, "2026-08-12", "overdue"],
] as const)("paid=%i total=%i due=%s", (paidCents, totalCents, due, expected) => {
  it(`is ${expected}`, () => {
    expect(
      deriveStatus({
        paidCents,
        totalCents,
        dueDate: new Date(`${due}T00:00:00Z`),
        now: new Date("2026-08-13T12:00:00Z"),
      }),
    ).toBe(expected);
  });
});

describe("amountDueCents", () => {
  it("returns the remaining balance", () => {
    expect(amountDueCents(100_000, 40_000)).toBe(60_000);
  });

  it("never goes negative", () => {
    expect(amountDueCents(100_000, 150_000)).toBe(0);
  });

  it("is zero when fully paid", () => {
    expect(amountDueCents(100_000, 100_000)).toBe(0);
  });
});

describe("status after a refund reduces paidCents", () => {
  const now = new Date("2026-08-13T12:00:00Z");

  function status(paidCents: number, due: string) {
    return deriveStatus({
      paidCents,
      totalCents: 100_000,
      dueDate: new Date(`${due}T00:00:00Z`),
      now,
    });
  }

  it("returns a fully paid future-due order to partially_paid", () => {
    expect(status(100_000, "2026-09-01")).toBe("paid");
    expect(status(40_000, "2026-09-01")).toBe("partially_paid");
  });

  it("returns a fully paid future-due order to pending when the refund clears the balance", () => {
    expect(status(100_000, "2026-09-01")).toBe("paid");
    expect(status(0, "2026-09-01")).toBe("pending");
  });

  it("returns a late-settled order to overdue when a refund reopens it", () => {
    expect(status(100_000, "2026-08-12")).toBe("paid");
    expect(status(40_000, "2026-08-12")).toBe("overdue");
  });
});
