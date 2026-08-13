"use client";

import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";

// A thin client wrapper so the whole row is clickable, while the customer
// cell (rendered by the caller) still contains a real <Link> for middle-click
// and keyboard navigation — see docs/implementation/07-dashboard.md.
export function OrderRow({ orderId, children }: { orderId: string; children: React.ReactNode }) {
  const router = useRouter();

  return (
    <TableRow className="cursor-pointer" onClick={() => router.push(`/orders/${orderId}`)}>
      {children}
    </TableRow>
  );
}
