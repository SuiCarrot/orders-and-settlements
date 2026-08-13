import { Prisma } from "@/generated/prisma";
import { prisma } from "@/server/db/prisma";
import { parseMoneyToCents, formatCents } from "@/server/domain/money";
import { lineTotalCents, orderTotalCents } from "@/server/domain/totals";
import type { OrderStatus } from "@/server/domain/status";
import { ConflictError, NotFoundError } from "@/server/http/errors";
import type { CreateOrderInput, ListOrdersQuery, UpdateOrderInput } from "@/lib/schemas/order";

export const orderWithRelations = {
  include: { items: true, payments: { orderBy: { paidAt: "desc" as const } } },
} satisfies Prisma.OrderDefaultArgs;

export type OrderWithRelations = Prisma.OrderGetPayload<typeof orderWithRelations>;

function buildItems(items: CreateOrderInput["items"]) {
  return items.map((item) => {
    const unitPriceCents = parseMoneyToCents(item.unitPrice);
    return {
      description: item.description,
      quantity: item.quantity,
      unitPriceCents,
      lineTotalCents: lineTotalCents({ ...item, unitPriceCents }),
    };
  });
}

export async function createOrder(userId: string, input: CreateOrderInput) {
  const items = buildItems(input.items);

  const totalCents = orderTotalCents(items);
  if (totalCents < 1) {
    throw new ConflictError("An order must total at least $0.01.", "EMPTY_ORDER_TOTAL");
  }

  return prisma.order.create({
    data: {
      userId,
      customer: input.customer,
      dueDate: new Date(`${input.dueDate}T00:00:00Z`),
      totalCents,
      items: { create: items },
    },
    ...orderWithRelations,
  });
}

export async function getOrder(userId: string, orderId: string): Promise<OrderWithRelations> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    ...orderWithRelations,
  });
  if (!order) throw new NotFoundError("Order");
  return order;
}

/**
 * SQL equivalent of each branch of `deriveStatus` (see src/server/domain/status.ts). Status is
 * not a column, so it cannot be filtered directly — this must stay in sync with that function by
 * hand. The seed script (phase 9) creates one order per status and the integration suite asserts
 * these four clauses partition the full set (every order matches exactly one filter).
 */
function statusWhere(status: OrderStatus, today: Date): Prisma.OrderWhereInput {
  switch (status) {
    case "paid":
      return { paidCents: { gte: prisma.order.fields.totalCents } };
    case "overdue":
      return { paidCents: { lt: prisma.order.fields.totalCents }, dueDate: { lt: today } };
    case "partially_paid":
      return {
        paidCents: { gt: 0, lt: prisma.order.fields.totalCents },
        dueDate: { gte: today },
      };
    case "pending":
      return { paidCents: 0, dueDate: { gte: today } };
  }
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function listOrders(userId: string, query: ListOrdersQuery) {
  const where: Prisma.OrderWhereInput = {
    userId,
    ...(query.status ? statusWhere(query.status, startOfTodayUtc()) : {}),
  };

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      ...orderWithRelations,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, total };
}

export interface OrderSummary {
  outstandingCents: number;
  overdueCents: number;
  orderCount: number;
}

/** One aggregate query pair, not a full order list, to answer "what do I owe" cheaply. */
export async function getOrderSummary(userId: string): Promise<OrderSummary> {
  const today = startOfTodayUtc();

  const [outstanding, overdue, orderCount] = await Promise.all([
    prisma.order.aggregate({
      where: { userId },
      _sum: { totalCents: true, paidCents: true },
    }),
    prisma.order.aggregate({
      where: { userId, dueDate: { lt: today }, paidCents: { lt: prisma.order.fields.totalCents } },
      _sum: { totalCents: true, paidCents: true },
    }),
    prisma.order.count({ where: { userId } }),
  ]);

  return {
    outstandingCents: (outstanding._sum.totalCents ?? 0) - (outstanding._sum.paidCents ?? 0),
    overdueCents: (overdue._sum.totalCents ?? 0) - (overdue._sum.paidCents ?? 0),
    orderCount,
  };
}

export async function updateOrder(
  userId: string,
  orderId: string,
  input: UpdateOrderInput,
): Promise<OrderWithRelations> {
  const order = await getOrder(userId, orderId);

  if (input.items && order.payments.length > 0) {
    throw new ConflictError(
      "Line items cannot be changed after a payment has been recorded. " +
        "Cancel the payment first, or create a new order.",
      "ORDER_LOCKED",
      { paymentCount: order.payments.length, amountPaid: formatCents(order.paidCents) },
    );
  }

  const data: Prisma.OrderUpdateInput = {};
  if (input.customer !== undefined) data.customer = input.customer;
  if (input.dueDate !== undefined) data.dueDate = new Date(`${input.dueDate}T00:00:00Z`);

  if (input.items) {
    const items = buildItems(input.items);
    const totalCents = orderTotalCents(items);
    if (totalCents < 1) {
      throw new ConflictError("An order must total at least $0.01.", "EMPTY_ORDER_TOTAL");
    }
    data.totalCents = totalCents;
    data.items = { deleteMany: {}, create: items };
  }

  return prisma.order.update({ where: { id: order.id }, data, ...orderWithRelations });
}

export async function deleteOrder(userId: string, orderId: string): Promise<void> {
  const order = await getOrder(userId, orderId);

  if (order.paidCents > 0) {
    throw new ConflictError(
      "An order with recorded payments cannot be deleted.",
      "ORDER_HAS_PAYMENTS",
      { amountPaid: formatCents(order.paidCents) },
    );
  }

  await prisma.order.delete({ where: { id: order.id } });
}
