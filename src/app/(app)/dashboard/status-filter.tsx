"use client";

import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/server/domain/status";

const STATUSES: { value?: OrderStatus; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "pending", label: "Pending" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "refunded", label: "Refunded" },
];

interface StatusFilterProps {
  active?: OrderStatus;
  onSelect: (status?: OrderStatus) => void;
}

export function StatusFilter({ active, onSelect }: StatusFilterProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
      {STATUSES.map(({ value, label }) => (
        <a
          key={label}
          href={value ? `/dashboard?status=${value}` : "/dashboard"}
          aria-current={active === value ? "true" : undefined}
          onClick={(event) => {
            event.preventDefault();
            onSelect(value);
          }}
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition-colors",
            active === value
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          {label}
        </a>
      ))}
    </div>
  );
}
