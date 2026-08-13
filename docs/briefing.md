# Context & Architecture Briefing: Orders and Settlements

## 1. Executive Context
- **Objective:** Build a production-ready, full-stack application that models B2B orders with line items, partial payments, derived statuses, and strict financial transaction integrity[cite: 2].
- **Evaluation Core:** Business rules accuracy (over-payment prevention), REST API design, concurrent transaction safety, and UI dashboard clarity[cite: 2].

---

## 2. Core Business Requirements & Constraints

### A. Data Entities & Schema
1. **User (Auth):**
   - Basic Email + Password authentication[cite: 2].
   - Strict data isolation: Users can only view/modify their own orders and payments[cite: 2].

2. **Order:**
   - Fields: `customer` (string), `dueDate` (Date)[cite: 2].
   - Computed Fields: `subtotal` (sum of line items), `total` (same as subtotal for this assignment)[cite: 2].
   - Status (Derived on-the-fly or updated deterministically)[cite: 2]:
     - `pending`: Total payments = $0[cite: 2].
     - `partially_paid`: $0 < Total payments < Order total[cite: 2].
     - `paid`: Total payments = Order total[cite: 2].
     - `overdue`: Current Date > `dueDate` AND Total payments < Order total[cite: 2].

3. **OrderItem (Line Item):**
   - Fields: `description` (string), `quantity` (int >= 1), `unitPrice` (decimal >= 0)[cite: 2].

4. **Payment:**
   - Fields: `amount` (decimal >= 0.01), `date` (Date), `note` (optional string)[cite: 2].
   - Constraint: `SUM(payments)` must NEVER exceed `Order.total`[cite: 2].

---

## 3. Technical Requirements & Implementation Strategy

### Stack & Infrastructure (Free-Tier Production Setup)
- **Framework:** Next.js (App Router) - Monorepo structure serving both REST API Routes (`/api/...`) and React Frontend[cite: 2].
- **Database & ORM:** PostgreSQL (via Supabase or Neon) + Prisma ORM / Drizzle.
- **Styling & UI:** Tailwind CSS + Shadcn UI (for rapid, professional B2B dashboard aesthetics).
- **Testing:** Vitest / Jest (Focusing on payment validation math, status transitions, and over-payment prevention)[cite: 2].
- **Deployment:** Vercel (Hobby Tier) + Managed Postgres.

### Critical Engineering Patterns
1. **Concurrency & Race Conditions (Over-Payment Protection):**
   - When recording a payment, wrap the check and write inside a **Database Transaction** (`prisma.$transaction` with strict isolation or atomic check/increment)[cite: 2].
   - Prevent two simultaneous requests from over-allocating payments[cite: 2].
2. **Precision & Money Handling:**
   - Store amounts as **Integer Cents** (e.g., $10.50 -> `1050`) or use `Decimal.js` to eliminate JS floating-point precision issues[cite: 3].
3. **API Response Contracts:**
   - Return clear, actionable HTTP 400 validation errors[cite: 2].
   - Example error on over-payment: `"Payment amount ($600.00) exceeds maximum allowed remaining balance ($400.00)"`[cite: 2].

---

## 4. Expected Deliverables
1. **Clean Codebase:** Clean architecture, separation of concerns (Domain Logic vs Infrastructure).
2. **Automated Tests:** Unit tests for calculation module and status transition matrix[cite: 2].
3. **Live Deployed App:** Working URL on Vercel[cite: 2].
4. **Comprehensive README.md:** Setup guide, API overview, concurrency decisions, trade-offs, and future improvements[cite: 2].