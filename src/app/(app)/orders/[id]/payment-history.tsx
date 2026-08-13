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
import { RefundDialog } from "./refund-dialog";
import type { SerialisedOrder, SerialisedPayment } from "./types";

interface LedgerRow {
  kind: "payment" | "refund";
  id: string;
  date: string;
  createdAt: string;
  signedCents: number;
  note: string;
  paymentId?: string;
  refundableAmount?: string;
}

function buildLedger(payments: SerialisedPayment[]): LedgerRow[] {
  const rows: LedgerRow[] = [];
  for (const payment of payments) {
    rows.push({
      kind: "payment",
      id: payment.id,
      date: payment.paidAt,
      createdAt: payment.createdAt,
      signedCents: parseMoneyToCents(payment.amount),
      note: payment.note ?? "—",
      paymentId: payment.id,
      refundableAmount: payment.refundableAmount,
    });
    for (const refund of payment.refunds) {
      rows.push({
        kind: "refund",
        id: refund.id,
        date: refund.refundedAt,
        createdAt: refund.createdAt,
        signedCents: -parseMoneyToCents(refund.amount),
        note: refund.reason,
      });
    }
  }

  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return 0;
  });
  return rows;
}

export function PaymentHistory({ order }: { order: SerialisedOrder }) {
  const payments = order.payments ?? [];

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

  const chronological = buildLedger(payments);
  let cumulativeCents = 0;
  const runningBalanceById = new Map<string, string>();
  for (const row of chronological) {
    cumulativeCents += row.signedCents;
    runningBalanceById.set(row.id, formatCents(cumulativeCents));
  }
  const display = [...chronological].reverse();

  return (
    <div className="space-y-2">
      <h2 className="font-medium">Payment history</h2>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Balance paid</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Recorded</TableHead>
              <TableHead className="w-[1%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {display.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{formatDate(row.date)}</TableCell>
                <TableCell>{row.kind === "payment" ? "Payment" : "Refund"}</TableCell>
                <TableCell
                  className={`text-right tabular-nums ${row.kind === "refund" ? "text-destructive" : ""}`}
                >
                  {row.kind === "refund" ? "−" : ""}
                  {currency(formatCents(Math.abs(row.signedCents)))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {currency(runningBalanceById.get(row.id)!)}
                </TableCell>
                <TableCell className="text-muted-foreground">{row.note}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(row.createdAt)}
                </TableCell>
                <TableCell>
                  {row.kind === "payment" &&
                    row.paymentId &&
                    row.refundableAmount &&
                    row.refundableAmount !== "0.00" && (
                      <RefundDialog
                        orderId={order.id}
                        paymentId={row.paymentId}
                        maxAmount={row.refundableAmount}
                      />
                    )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
