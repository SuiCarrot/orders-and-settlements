import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { currency, formatDate, formatDateTime } from "@/lib/format";
import { formatCents, parseMoneyToCents } from "@/server/domain/money";
import type { SerialisedPayment } from "./types";

export function PaymentHistory({
  payments,
}: {
  payments: SerialisedPayment[];
  orderTotal: string;
}) {
  if (payments.length === 0) {
    return (
      <div className="space-y-2">
        <h2 className="font-medium">Payment history</h2>
        <p className="text-muted-foreground rounded-xl border border-dashed py-8 text-center text-sm">
          No payments recorded yet.
        </p>
      </div>
    );
  }

  // Payments arrive newest-first (see order-service.ts). The running balance
  // is a story told in chronological order — this is the whole reason a
  // history exists rather than just a total — so it is computed oldest-first
  // and then mapped back onto the display order.
  const chronological = [...payments].reverse();
  let cumulativeCents = 0;
  const runningBalanceByPaymentId = new Map<string, string>();
  for (const payment of chronological) {
    cumulativeCents += parseMoneyToCents(payment.amount);
    runningBalanceByPaymentId.set(payment.id, formatCents(cumulativeCents));
  }

  return (
    <div className="space-y-2">
      <h2 className="font-medium">Payment history</h2>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Balance paid</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Recorded</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell>{formatDate(payment.paidAt)}</TableCell>
                <TableCell className="text-right tabular-nums">{currency(payment.amount)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {currency(runningBalanceByPaymentId.get(payment.id)!)}
                </TableCell>
                <TableCell className="text-muted-foreground">{payment.note ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(payment.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
