import { formatCents } from "./money";

export class ExcessRefundError extends Error {
  readonly code = "EXCESS_REFUND";

  constructor(
    readonly attemptedCents: number,
    readonly paymentAmountCents: number,
    readonly alreadyRefundedCents: number,
    readonly orderPaidCents: number,
  ) {
    const maxAllowed = Math.min(paymentAmountCents - alreadyRefundedCents, orderPaidCents);
    super(
      maxAllowed <= 0
        ? alreadyRefundedCents >= paymentAmountCents
          ? "This payment has already been fully refunded."
          : "This order has no remaining paid balance to refund."
        : `Refund of $${formatCents(attemptedCents)} exceeds the refundable amount of ` +
            `$${formatCents(maxAllowed)} for this payment.`,
    );
  }

  get details() {
    const maxAllowed = Math.min(
      this.paymentAmountCents - this.alreadyRefundedCents,
      this.orderPaidCents,
    );
    return {
      maxAllowedAmount: formatCents(Math.max(0, maxAllowed)),
      paymentAmount: formatCents(this.paymentAmountCents),
      alreadyRefunded: formatCents(this.alreadyRefundedCents),
      amountPaid: formatCents(this.orderPaidCents),
      attemptedAmount: formatCents(this.attemptedCents),
    };
  }
}

export function assertRefundFits(input: {
  amountCents: number;
  paymentAmountCents: number;
  alreadyRefundedCents: number;
  orderPaidCents: number;
}): void {
  const remainingOnPayment = input.paymentAmountCents - input.alreadyRefundedCents;
  const maxAllowed = Math.min(remainingOnPayment, input.orderPaidCents);
  if (input.amountCents > maxAllowed) {
    throw new ExcessRefundError(
      input.amountCents,
      input.paymentAmountCents,
      input.alreadyRefundedCents,
      input.orderPaidCents,
    );
  }
}
