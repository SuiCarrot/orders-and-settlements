"use client";

import { Button } from "@/components/ui/button";
import type { OrderStatus } from "@/server/domain/status";

interface PaginationProps {
  page: number;
  perPage: number;
  total: number;
  status?: OrderStatus;
  onPageChange?: (page: number) => void;
}

export function Pagination({ page, perPage, total, status, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) return null;

  function href(targetPage: number) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/dashboard?${qs}` : "/dashboard";
  }

  return (
    <div className="flex items-center justify-between">
      <p className="text-muted-foreground text-sm">
        Page {page} of {totalPages} ({total} order{total === 1 ? "" : "s"})
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          render={onPageChange ? undefined : <a href={href(page - 1)} />}
          onClick={onPageChange ? () => onPageChange(page - 1) : undefined}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          render={onPageChange ? undefined : <a href={href(page + 1)} />}
          onClick={onPageChange ? () => onPageChange(page + 1) : undefined}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
