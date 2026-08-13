import { describe, expect, it } from "vitest";
import { InvalidMoneyError, formatCents, parseMoneyToCents } from "@/server/domain/money";

describe("parseMoneyToCents / formatCents round trip", () => {
  it.each([
    ["0.01", 1],
    ["1000.00", 100_000],
    ["1000.5", 100_050],
    ["0.00", 0],
    ["-12.34", -1234],
  ])("%s -> %i cents", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
    expect(formatCents(expected)).toBe(input === "1000.5" ? "1000.50" : input);
  });

  it("sums 0.10 and 0.20 to exactly 0.30", () => {
    const sum = parseMoneyToCents("0.10") + parseMoneyToCents("0.20");
    expect(formatCents(sum)).toBe("0.30");
  });
});

describe("parseMoneyToCents rejections", () => {
  it.each(["10.005", "1,000.00", "abc", "", "1e3"])("rejects %s", (input) => {
    expect(() => parseMoneyToCents(input)).toThrow(InvalidMoneyError);
  });
});
