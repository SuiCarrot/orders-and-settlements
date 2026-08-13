import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/server/domain/money";
import { currency } from "@/lib/format";
import type { OrderSummary } from "@/server/services/order-service";

export function SummaryCards({ summary }: { summary: OrderSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card>
        <CardContent className="space-y-1">
          <CardDescription>Orders</CardDescription>
          <CardTitle className="text-2xl tabular-nums">{summary.orderCount}</CardTitle>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-1">
          <CardDescription>Total outstanding</CardDescription>
          <CardTitle className="text-2xl tabular-nums">
            {currency(formatCents(summary.outstandingCents))}
          </CardTitle>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-1">
          <CardDescription>Overdue</CardDescription>
          <CardTitle className="text-2xl tabular-nums text-red-700 dark:text-red-400">
            {currency(formatCents(summary.overdueCents))}
          </CardTitle>
        </CardContent>
      </Card>
    </div>
  );
}
