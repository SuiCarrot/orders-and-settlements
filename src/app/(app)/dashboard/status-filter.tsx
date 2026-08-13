import Link from "next/link";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/server/domain/status";

const STATUSES: { value?: OrderStatus; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "pending", label: "Pending" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

// Filter state lives in the URL, not React state: /dashboard?status=overdue is
// shareable, bookmarkable, survives a refresh, and (being a plain <Link>)
// needs no client-side JavaScript to work at all.
export function StatusFilter({ active }: { active?: OrderStatus }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
      {STATUSES.map(({ value, label }) => (
        <Link
          key={label}
          // A filter change always resets to page one, or a filtered-out page
          // three would silently render empty.
          href={value ? `/dashboard?status=${value}` : "/dashboard"}
          aria-current={active === value ? "true" : undefined}
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition-colors",
            active === value
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
