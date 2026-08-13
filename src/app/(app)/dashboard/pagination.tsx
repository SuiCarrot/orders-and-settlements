import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { OrderStatus } from "@/server/domain/status";

interface PaginationProps {
  page: number;
  perPage: number;
  total: number;
  status?: OrderStatus;
}

export function Pagination({ page, perPage, total, status }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) return null;

  function href(targetPage: number) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("page", String(targetPage));
    return `/dashboard?${params.toString()}`;
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
          render={<Link href={href(page - 1)} />}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          render={<Link href={href(page + 1)} />}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
