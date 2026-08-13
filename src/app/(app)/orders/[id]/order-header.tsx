"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { DueDate } from "@/app/(app)/dashboard/due-date";
import type { SerialisedOrder } from "./types";

export function OrderHeader({
  order,
  actions,
}: {
  order: SerialisedOrder;
  actions?: ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => {
          router.push("/dashboard");
          router.refresh();
        }}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-3.5" />
        Back to orders
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{order.customer}</h1>
          <div className="text-muted-foreground flex items-center gap-1 text-sm">
            <span>Due</span>
            <DueDate date={order.dueDate} status={order.status} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <StatusBadge status={order.status} />
        </div>
      </div>
    </div>
  );
}
