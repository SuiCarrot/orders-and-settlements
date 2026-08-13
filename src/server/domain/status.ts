export type OrderStatus = "pending" | "partially_paid" | "paid" | "overdue" | "refunded";

export interface StatusInput {
  totalCents: number;
  paidCents: number;
  dueDate: Date;
  now: Date;
  /** Sum of refund rows. Distinguishes "never paid" from "fully reversed". */
  refundedCents?: number;
}

/** Compares calendar days in UTC — an order is overdue only after its due date has passed. */
function isPastDue(dueDate: Date, now: Date): boolean {
  return toUtcDayNumber(now) > toUtcDayNumber(dueDate);
}

function toUtcDayNumber(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function isFullyRefunded(paidCents: number, refundedCents: number): boolean {
  return paidCents === 0 && refundedCents > 0;
}

export function deriveStatus({
  totalCents,
  paidCents,
  dueDate,
  now,
  refundedCents = 0,
}: StatusInput): OrderStatus {
  if (paidCents >= totalCents) return "paid";
  if (isFullyRefunded(paidCents, refundedCents)) return "refunded";
  if (isPastDue(dueDate, now)) return "overdue";
  if (paidCents > 0) return "partially_paid";
  return "pending";
}

export function amountDueCents(
  totalCents: number,
  paidCents: number,
  refundedCents = 0,
): number {
  if (isFullyRefunded(paidCents, refundedCents)) return 0;
  return Math.max(0, totalCents - paidCents);
}

export function sumRefundedCents(
  payments: ReadonlyArray<{ refunds?: ReadonlyArray<{ amountCents: number }> }>,
): number {
  return payments.reduce(
    (sum, payment) =>
      sum + (payment.refunds ?? []).reduce((inner, refund) => inner + refund.amountCents, 0),
    0,
  );
}
