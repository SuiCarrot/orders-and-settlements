import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/server/domain/status";

const VARIANTS: Record<OrderStatus, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  },
  partially_paid: {
    label: "Partially paid",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  },
  paid: {
    label: "Paid",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
  },
  overdue: {
    label: "Overdue",
    className: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
  },
};

// Colour is never the only signal — the label is always text, so the table
// reads correctly without colour vision.
export function StatusBadge({ status }: { status: OrderStatus }) {
  const { label, className } = VARIANTS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {label}
    </span>
  );
}
