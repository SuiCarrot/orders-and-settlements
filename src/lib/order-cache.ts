import type { SerialisedOrder } from "@/app/(app)/orders/[id]/types";

const STORAGE_KEY = "orders-cache-v1";

type Listener = () => void;

const listeners = new Set<Listener>();
let memory = new Map<string, SerialisedOrder>();
let hydrated = false;

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...memory.entries()]));
  } catch {
    // Quota or private-mode restrictions — the in-memory map still works for this tab.
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    memory = new Map(JSON.parse(raw) as [string, SerialisedOrder][]);
  } catch {
    memory = new Map();
  }
}

export function subscribeOrderCache(listener: Listener) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCachedOrder(id: string): SerialisedOrder | null {
  hydrate();
  return memory.get(id) ?? null;
}

export function cacheOrders(orders: SerialisedOrder[]) {
  hydrate();
  for (const order of orders) memory.set(order.id, order);
  persist();
  emit();
}

export function cacheOrder(order: SerialisedOrder) {
  cacheOrders([order]);
}

export function dropCachedOrder(id: string) {
  hydrate();
  memory.delete(id);
  persist();
  emit();
}
