import { formatDate, relativeDueHint } from "@/lib/format";
import type { OrderStatus } from "@/server/domain/status";

export function DueDate({ date, status }: { date: string; status: OrderStatus }) {
  const hint = relativeDueHint(date);
  return (
    <div>
      <div>{formatDate(date)}</div>
      {hint && (
        <div
          className={
            status === "overdue"
              ? "text-xs text-red-700 dark:text-red-400"
              : "text-muted-foreground text-xs"
          }
        >
          {hint}
        </div>
      )}
    </div>
  );
}
