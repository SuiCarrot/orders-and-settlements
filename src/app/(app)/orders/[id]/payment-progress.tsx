import { Card, CardContent } from "@/components/ui/card";
import { currency } from "@/lib/format";
import { RecordPaymentDialog } from "./record-payment-dialog";
import type { SerialisedOrder } from "./types";

export function PaymentProgress({ order }: { order: SerialisedOrder }) {
  const paidRatio = Number(order.orderTotal) === 0 ? 0 : Number(order.amountPaid) / Number(order.orderTotal);
  const percentage = Math.min(100, Math.max(0, paidRatio * 100));

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid grid-cols-3 gap-6">
            <Figure label="Order total" value={order.orderTotal} />
            <Figure label="Amount paid" value={order.amountPaid} />
            <Figure label="Amount due" value={order.amountDue} emphasise />
          </div>
          <RecordPaymentDialog order={order} />
        </div>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, emphasise }: { label: string; value: string; emphasise?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className={`tabular-nums ${emphasise ? "text-lg font-semibold" : "text-base"}`}>
        {currency(value)}
      </div>
    </div>
  );
}
