import type { Order, OrderItem, Payment } from "@/generated/prisma";
import { amountDueCents, deriveStatus } from "@/server/domain/status";
import { formatCents } from "@/server/domain/money";
import type { OrderWithRelations } from "@/server/services/order-service";

export function serialiseItem(item: OrderItem) {
  return {
    id: item.id,
    description: item.description,
    quantity: item.quantity,
    unitPrice: formatCents(item.unitPriceCents),
    lineTotal: formatCents(item.lineTotalCents),
  };
}

export function serialisePayment(payment: Payment) {
  return {
    id: payment.id,
    amount: formatCents(payment.amountCents),
    paidAt: payment.paidAt.toISOString().slice(0, 10),
    note: payment.note,
    createdAt: payment.createdAt.toISOString(),
  };
}

type SerialisableOrder = Pick<Order, "id" | "customer" | "dueDate" | "totalCents" | "paidCents" | "createdAt"> & {
  items: OrderItem[];
  payments?: Payment[];
};

export function serialiseOrder(order: SerialisableOrder | OrderWithRelations, now = new Date()) {
  return {
    id: order.id,
    customer: order.customer,
    dueDate: order.dueDate.toISOString().slice(0, 10),
    status: deriveStatus({
      totalCents: order.totalCents,
      paidCents: order.paidCents,
      dueDate: order.dueDate,
      now,
    }),
    orderTotal: formatCents(order.totalCents),
    amountPaid: formatCents(order.paidCents),
    amountDue: formatCents(amountDueCents(order.totalCents, order.paidCents)),
    items: order.items.map(serialiseItem),
    payments: order.payments?.map(serialisePayment),
    createdAt: order.createdAt.toISOString(),
  };
}
