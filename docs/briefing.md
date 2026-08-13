# Architecture Briefing: Orders and Settlements

## 1. Objective

Build a production-ready, full-stack application that models B2B orders with line items, partial
payments, derived statuses, and strict financial transaction integrity.

**Priorities, in order:** business rules accuracy (overpayment prevention), REST API design,
concurrent transaction safety, and UI dashboard clarity. Everything else is scoped around
protecting these four.

---

## 2. Core Business Requirements & Constraints

### A. Data Entities & Schema

1. **User (Auth):**
   - Basic email + password authentication.
   - Strict data isolation: users can only view and modify their own orders and payments.

2. **Order:**
   - Fields: `customer` (string), `dueDate` (Date).
   - Computed fields: `subtotal` (sum of line items), `total` (same as subtotal in this model).
   - Status (derived on-the-fly, never stored):
     - `pending`: total payments = $0.
     - `partially_paid`: $0 < total payments < order total.
     - `paid`: total payments = order total.
     - `overdue`: current date > `dueDate` AND total payments < order total.

3. **OrderItem (Line Item):**
   - Fields: `description` (string), `quantity` (int >= 1), `unitPrice` (decimal >= 0).

4. **Payment:**
   - Fields: `amount` (decimal >= 0.01), `date` (Date), `note` (optional string).
   - Constraint: `SUM(payments)` must never exceed `Order.total`.

---

## 3. Technical Requirements & Implementation Strategy

### Stack & Infrastructure (Free-Tier Production Setup)

- **Framework:** Next.js (App Router) — a single app serving both REST API routes (`/api/...`) and
  the React frontend.
- **Database & ORM:** PostgreSQL (Neon) + Prisma ORM.
- **Styling & UI:** Tailwind CSS + shadcn/ui, for a fast, professional B2B dashboard aesthetic.
- **Testing:** Vitest, focused on payment validation math, status transitions, and overpayment
  prevention.
- **Deployment:** Vercel (Hobby tier) + managed Postgres.

### Critical Engineering Patterns

1. **Concurrency & Race Conditions (Overpayment Protection):**
   - When recording a payment, wrap the check and the write inside a single database transaction
     (`prisma.$transaction`, with an explicit row lock or an atomic conditional update).
   - Two simultaneous requests must never both succeed in over-allocating payments against the
     same order.
2. **Precision & Money Handling:**
   - Store amounts as integer cents (e.g. $10.50 → `1050`) to eliminate floating-point precision
     issues entirely — never a JS `number` for currency arithmetic.
3. **API Response Contracts:**
   - Return clear, actionable error responses, not just an HTTP status code.
   - Example, on overpayment: `"Payment amount ($600.00) exceeds maximum allowed remaining balance
     ($400.00)"`, with the numbers available as structured data a client can act on.

---

## 4. Deliverables

1. **Clean codebase.** Clear separation of concerns — domain logic isolated from infrastructure.
2. **Automated tests.** Unit tests for the calculation module and the full status transition
   matrix, plus an integration test proving the concurrency guarantee against a real database.
3. **Live deployed app.** A working URL on Vercel with seeded demo data.
4. **A comprehensive README.** Setup guide, API overview, concurrency decisions, trade-offs, and
   what would change before a real production launch.
