import { currency } from "@/lib/format";
import { formatCents } from "@/server/domain/money";
import { formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import type { OrderStatus } from "@/server/domain/status";
import type { SerialisedOrder } from "./types";

const LABELS: Record<string, string> = {
  "order.created": "Order created",
  "order.updated": "Order updated",
  "payment.recorded": "Payment recorded",
  "refund.recorded": "Refund recorded",
};

export function AuditTimeline({ events }: { events: NonNullable<SerialisedOrder["events"]> }) {
  if (events.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="font-medium">Activity</h2>
      <ol className="space-y-3 border-l pl-4">
        {events.map((event) => {
          const payload = event.payload as { amountCents?: number };
          return (
            <li key={event.id} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{LABELS[event.type] ?? event.type}</span>
                {event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus && (
                  <>
                    <StatusBadge status={event.fromStatus as OrderStatus} />
                    <span className="text-muted-foreground">→</span>
                    <StatusBadge status={event.toStatus as OrderStatus} />
                  </>
                )}
                {typeof payload.amountCents === "number" && (
                  <span className="tabular-nums">
                    {currency(formatCents(payload.amountCents))}
                  </span>
                )}
              </div>
              <div className="text-muted-foreground text-xs">{formatDateTime(event.createdAt)}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
