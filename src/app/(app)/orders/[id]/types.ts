import type { serialiseOrder } from "@/server/http/serialise";

export type SerialisedOrder = ReturnType<typeof serialiseOrder>;
export type SerialisedItem = SerialisedOrder["items"][number];
export type SerialisedPayment = NonNullable<SerialisedOrder["payments"]>[number];
