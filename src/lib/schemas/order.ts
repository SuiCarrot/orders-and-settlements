import { z } from "zod";

const moneyString = z
  .string()
  .regex(/^\d{1,13}(\.\d{1,2})?$/, 'Use a decimal amount with up to two places, e.g. "500.00".');

export const lineItemSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.int().min(1).max(1_000_000),
  unitPrice: moneyString,
});

export const createOrderSchema = z.object({
  customer: z.string().trim().min(1).max(200),
  dueDate: z.iso.date(), // "2026-08-20"
  items: z.array(lineItemSchema).min(1).max(100),
});

export const updateOrderSchema = z.object({
  customer: z.string().trim().min(1).max(200).optional(),
  dueDate: z.iso.date().optional(),
  items: z.array(lineItemSchema).min(1).max(100).optional(),
});

export const listOrdersSchema = z.object({
  status: z.enum(["pending", "partially_paid", "paid", "overdue"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export type LineItemValues = z.infer<typeof lineItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersSchema>;
