"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { getCachedOrder, cacheOrder, subscribeOrderCache } from "@/lib/order-cache";
import { readApiError } from "@/lib/api-error";
import { OrderHeader } from "./order-header";
import { PaymentProgress } from "./payment-progress";
import { LineItemsTable } from "./line-items-table";
import { PaymentHistory } from "./payment-history";
import { AuditTimeline } from "./audit-timeline";
import { EditOrderDialog } from "./edit-order-dialog";
import { DeleteOrderDialog } from "./delete-order-dialog";
import type { SerialisedOrder } from "./types";

export function OrderDetail({ id }: { id: string }) {
  const cached = useSyncExternalStore(
    subscribeOrderCache,
    () => getCachedOrder(id),
    () => null,
  );
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (getCachedOrder(id)) return;

    let cancelled = false;
    setFetchError(null);

    fetch(`/api/orders/${id}`)
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 404) {
          setFetchError("not-found");
          return;
        }
        if (!response.ok) {
          const error = await readApiError(response);
          setFetchError(error.message);
          return;
        }
        const body = (await response.json()) as { data: SerialisedOrder };
        cacheOrder(body.data);
      })
      .catch(() => {
        if (!cancelled) setFetchError("Could not load this order.");
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (cached) {
    return (
      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <OrderHeader
          order={cached}
          actions={
            <>
              <EditOrderDialog order={cached} />
              <DeleteOrderDialog order={cached} />
            </>
          }
        />
        <PaymentProgress order={cached} />
        <LineItemsTable
          items={cached.items}
          total={cached.orderTotal}
          isLocked={(cached.payments ?? []).length > 0}
        />
        <PaymentHistory order={cached} />
        <AuditTimeline events={cached.events ?? []} />
      </main>
    );
  }

  if (fetchError === "not-found") {
    return (
      <main className="mx-auto max-w-4xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Order not found</h1>
        <p className="text-muted-foreground text-sm">
          This order does not exist, or it belongs to another account.
        </p>
        <Link href="/dashboard" className="text-sm underline underline-offset-4">
          Back to orders
        </Link>
      </main>
    );
  }

  if (fetchError) {
    return (
      <main className="mx-auto max-w-4xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Could not load order</h1>
        <p className="text-muted-foreground text-sm">{fetchError}</p>
        <Link href="/dashboard" className="text-sm underline underline-offset-4">
          Back to orders
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <p className="text-muted-foreground text-sm">Loading order…</p>
    </main>
  );
}
