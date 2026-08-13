-- Database-level invariants for financial correctness.
-- These are the last line of defence: application code and Zod validation
-- enforce the same rules, but a CHECK constraint keeps them true even if a
-- bug, a partial migration, or a manual UPDATE bypasses the application.

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_total_non_negative" CHECK ("total_cents" >= 0),
  ADD CONSTRAINT "orders_paid_within_total"
    CHECK ("paid_cents" >= 0 AND "paid_cents" <= "total_cents");

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" >= 1),
  ADD CONSTRAINT "order_items_unit_price_non_negative" CHECK ("unit_price_cents" >= 0),
  ADD CONSTRAINT "order_items_line_total_consistent"
    CHECK ("line_total_cents" = "quantity" * "unit_price_cents");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive" CHECK ("amount_cents" >= 1);
