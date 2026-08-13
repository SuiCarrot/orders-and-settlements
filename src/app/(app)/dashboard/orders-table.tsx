"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { currency } from "@/lib/format";
import type { OrderStatus } from "@/server/domain/status";
import { DueDate } from "./due-date";
import { OrderRow } from "./order-row";
import type { SerialisedOrder } from "@/app/(app)/orders/[id]/types";

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "pending",
  partially_paid: "partially paid",
  paid: "paid",
  overdue: "overdue",
};

export type DashboardOrder = SerialisedOrder;

interface OrdersTableProps {
  orders: DashboardOrder[];
  hasAnyOrders: boolean;
  activeStatus?: OrderStatus;
  onClearFilter?: () => void;
}

export function OrdersTable({
  orders,
  hasAnyOrders,
  activeStatus,
  onClearFilter,
}: OrdersTableProps) {
  if (orders.length === 0) {
    return hasAnyOrders ? (
      <EmptyFilterState status={activeStatus} onClearFilter={onClearFilter} />
    ) : (
      <EmptyState />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Order total</TableHead>
            <TableHead className="text-right">Amount paid</TableHead>
            <TableHead className="text-right">Amount due</TableHead>
            <TableHead>Due date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <OrderRow key={order.id} orderId={order.id}>
              <TableCell className="font-medium">
                <Link href={`/orders/${order.id}`} className="hover:underline">
                  {order.customer}
                </Link>
              </TableCell>
              <TableCell>
                <StatusBadge status={order.status} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {currency(order.orderTotal)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {currency(order.amountPaid)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {currency(order.amountDue)}
              </TableCell>
              <TableCell>
                <DueDate date={order.dueDate} status={order.status} />
              </TableCell>
            </OrderRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
      <p className="text-lg font-medium">No orders yet</p>
      <p className="text-muted-foreground max-w-sm text-sm">
        Create your first order to start tracking payments and due dates.
      </p>
      <Button render={<Link href="/orders/new" />}>Create your first order</Button>
    </div>
  );
}

function EmptyFilterState({
  status,
  onClearFilter,
}: {
  status?: OrderStatus;
  onClearFilter?: () => void;
}) {
  const label = status ? STATUS_LABELS[status] : "matching";
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
      <p className="text-lg font-medium">No {label} orders</p>
      <p className="text-muted-foreground max-w-sm text-sm">
        {status === "overdue"
          ? "Nothing is overdue right now — that's a good thing."
          : `You have no orders with this status.`}
      </p>
      <Button variant="outline" onClick={onClearFilter}>
        Clear filter
      </Button>
    </div>
  );
}
