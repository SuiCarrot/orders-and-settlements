export interface LineItemInput {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export function lineTotalCents(item: LineItemInput): number {
  return item.quantity * item.unitPriceCents;
}

export function orderTotalCents(items: LineItemInput[]): number {
  return items.reduce((sum, item) => sum + lineTotalCents(item), 0);
}
