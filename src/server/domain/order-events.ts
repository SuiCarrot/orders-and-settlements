import { deriveStatus, type OrderStatus } from "./status";

export type OrderEventType =
  | "order.created"
  | "order.updated"
  | "payment.recorded"
  | "refund.recorded";

interface StatusSnapshot {
  totalCents: number;
  paidCents: number;
  dueDate: Date;
}

/** Same deriveStatus the UI uses, so the log cannot record a transition the UI would not show. */
export function eventStatus(snapshot: StatusSnapshot, now = new Date()): OrderStatus {
  return deriveStatus({ ...snapshot, now });
}
