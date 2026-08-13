export class InvalidMoneyError extends Error {
  constructor(public readonly input: string) {
    super(`"${input}" is not a valid monetary amount. Use up to two decimal places, e.g. "1000.00".`);
  }
}

const MONEY_PATTERN = /^-?\d{1,13}(\.\d{1,2})?$/;

/** "1000.5" -> 100050. Rejects anything with more than two decimal places. */
export function parseMoneyToCents(input: string): number {
  const trimmed = input.trim();
  if (!MONEY_PATTERN.test(trimmed)) throw new InvalidMoneyError(input);

  const negative = trimmed.startsWith("-");
  const [whole, fraction = ""] = trimmed.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  return negative ? -cents : cents;
}

/** 100050 -> "1000.50". Always two decimal places, no thousands separator. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
