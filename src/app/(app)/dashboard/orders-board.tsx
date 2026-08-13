"use client";

import { useEffect, useMemo, useState } from "react";
import type { OrderStatus } from "@/server/domain/status";
import { cacheOrders } from "@/lib/order-cache";
import { StatusFilter } from "./status-filter";
import { OrdersTable, type DashboardOrder } from "./orders-table";
import { Pagination } from "./pagination";

interface OrdersBoardProps {
  orders: DashboardOrder[];
  hasAnyOrders: boolean;
  initialStatus?: OrderStatus;
  initialPage: number;
  perPage: number;
}

function dashboardUrl(status?: OrderStatus, page = 1) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/dashboard?${qs}` : "/dashboard";
}

/**
 * The first paint still comes from the server. After that, status and page
 * changes filter the already-loaded list in memory and only rewrite the URL
 * via `history.replaceState` — `router.push` would refetch the RSC payload
 * from Neon, which is the delay the tabs were showing.
 *
 * The same payload is written to a tab-local cache so opening an order from
 * this table does not query Neon again for data the list already returned.
 */
export function OrdersBoard({
  orders,
  hasAnyOrders,
  initialStatus,
  initialPage,
  perPage,
}: OrdersBoardProps) {
  const [status, setStatus] = useState<OrderStatus | undefined>(initialStatus);
  const [page, setPage] = useState(initialPage);

  useEffect(() => {
    cacheOrders(orders);
  }, [orders]);

  const filtered = useMemo(
    () => (status ? orders.filter((order) => order.status === status) : orders),
    [orders, status],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  function syncUrl(nextStatus: OrderStatus | undefined, nextPage: number) {
    window.history.replaceState(null, "", dashboardUrl(nextStatus, nextPage));
  }

  function selectStatus(next?: OrderStatus) {
    setStatus(next);
    setPage(1);
    syncUrl(next, 1);
  }

  function selectPage(next: number) {
    setPage(next);
    syncUrl(status, next);
  }

  return (
    <>
      <StatusFilter active={status} onSelect={selectStatus} />
      <OrdersTable
        orders={pageItems}
        hasAnyOrders={hasAnyOrders}
        activeStatus={status}
        onClearFilter={() => selectStatus(undefined)}
      />
      <Pagination
        page={currentPage}
        perPage={perPage}
        total={filtered.length}
        status={status}
        onPageChange={selectPage}
      />
    </>
  );
}
