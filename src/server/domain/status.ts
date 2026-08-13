export type OrderStatus = "pending" | "partially_paid" | "paid" | "overdue";

export interface StatusInput {
  totalCents: number;
  paidCents: number;
  dueDate: Date;
  now: Date;
}

/** Compares calendar days in UTC — an order is overdue only after its due date has passed. */
function isPastDue(dueDate: Date, now: Date): boolean {
  return toUtcDayNumber(now) > toUtcDayNumber(dueDate);
}

function toUtcDayNumber(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function deriveStatus({ totalCents, paidCents, dueDate, now }: StatusInput): OrderStatus {
  if (paidCents >= totalCents) return "paid";
  if (isPastDue(dueDate, now)) return "overdue";
  if (paidCents > 0) return "partially_paid";
  return "pending";
}

export function amountDueCents(totalCents: number, paidCents: number): number {
  return Math.max(0, totalCents - paidCents);
}
