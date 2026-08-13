import { describe, expect, it } from "vitest";
import { csvField, toCsv } from "@/server/domain/csv";
import { exportOrdersSchema } from "@/lib/schemas/order";

describe("csvField", () => {
  it("quotes commas and doubles embedded quotes", () => {
    expect(csvField('Smith, Jones & Co')).toBe('"Smith, Jones & Co"');
    expect(csvField('He said "hello"')).toBe('"He said ""hello"""');
  });

  it("prefixes formula-like values to prevent CSV injection", () => {
    expect(csvField("=1+1")).toBe("'=1+1");
    expect(csvField("+cmd")).toBe("'+cmd");
    expect(csvField("-1+1")).toBe("'-1+1");
    expect(csvField("@SUM(A1)")).toBe("'@SUM(A1)");
  });
});

describe("toCsv", () => {
  it("joins with CRLF and a trailing newline", () => {
    expect(toCsv(["a", "b"], [["1", "2"]])).toBe("a,b\r\n1,2\r\n");
  });
});

describe("exportOrdersSchema", () => {
  it("accepts a range of at most 366 days", () => {
    expect(exportOrdersSchema.parse({ from: "2026-01-01", to: "2026-12-31" })).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });

  it("rejects from after to", () => {
    expect(() => exportOrdersSchema.parse({ from: "2026-12-31", to: "2026-01-01" })).toThrow();
  });

  it("rejects a range longer than 366 days", () => {
    expect(() => exportOrdersSchema.parse({ from: "2025-01-01", to: "2026-12-31" })).toThrow();
  });
});
