import { formatCents } from "./money";

export class OverpaymentError extends Error {
  readonly code = "OVERPAYMENT";

  constructor(
    readonly attemptedCents: number,
    readonly totalCents: number,
    readonly paidCents: number,
  ) {
    const remaining = totalCents - paidCents;
    super(
      remaining === 0
        ? `This order is already fully paid. No further payments can be recorded.`
        : `Payment of $${formatCents(attemptedCents)} exceeds the remaining balance of ` +
            `$${formatCents(remaining)} for this order.`,
    );
  }

  get details() {
    return {
      maxAllowedAmount: formatCents(this.totalCents - this.paidCents),
      orderTotal: formatCents(this.totalCents),
      amountPaid: formatCents(this.paidCents),
      attemptedAmount: formatCents(this.attemptedCents),
    };
  }
}

export function assertPaymentFits(input: {
  amountCents: number;
  totalCents: number;
  paidCents: number;
}): void {
  if (input.amountCents > input.totalCents - input.paidCents) {
    throw new OverpaymentError(input.amountCents, input.totalCents, input.paidCents);
  }
}
