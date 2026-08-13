import "dotenv/config";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db/prisma";
import { createOrder } from "@/server/services/order-service";
import { recordPayment } from "@/server/services/payment-service";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo-password-123";

/** Relative to "today" so the fixture never expires into a stale, all-overdue dashboard. */
function offsetDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

interface Fixture {
  customer: string;
  dueInDays: number;
  items: { description: string; quantity: number; unitPrice: string }[];
  payments: { amount: string; date: string; note?: string }[];
}

const FIXTURES: Fixture[] = [
  {
    customer: "Acme Inc",
    dueInDays: 7,
    items: [{ description: "Widget", quantity: 2, unitPrice: "500.00" }],
    payments: [],
  },
  {
    customer: "Globex Corporation",
    dueInDays: 14,
    items: [
      { description: "Enterprise licence", quantity: 1, unitPrice: "2400.00" },
      { description: "Onboarding support (hours)", quantity: 3, unitPrice: "150.00" },
    ],
    payments: [{ amount: "1000.00", date: offsetDate(0), note: "Initial deposit" }],
  },
  {
    customer: "Initech",
    dueInDays: 3,
    items: [{ description: "Consulting engagement", quantity: 1, unitPrice: "750.00" }],
    payments: [
      { amount: "250.00", date: offsetDate(-2) },
      { amount: "500.00", date: offsetDate(0) },
    ],
  },
  {
    customer: "Umbrella Health",
    // 4 x $325.50 = $1,302.00 exactly in integer cents — lands on
    // 1302.0000000000002 if computed in floats. A deliberate fixture for the
    // money-precision decision in 04-domain.md.
    dueInDays: -5,
    items: [{ description: "Lab supplies", quantity: 4, unitPrice: "325.50" }],
    payments: [],
  },
  {
    customer: "Stark Industries",
    // Partially paid AND past due — demonstrates that `overdue` outranks
    // `partially_paid` in the status precedence (see 04-domain.md).
    dueInDays: -12,
    items: [{ description: "Reactor components", quantity: 2, unitPrice: "1200.00" }],
    payments: [{ amount: "600.00", date: offsetDate(-10) }],
  },
  {
    customer: "Wayne Enterprises",
    // Settled after its due date — demonstrates that `paid` outranks
    // `overdue` once the balance reaches zero (see 04-domain.md).
    dueInDays: -20,
    items: [{ description: "Security consulting", quantity: 1, unitPrice: "89.99" }],
    payments: [{ amount: "89.99", date: offsetDate(-1) }],
  },
];

async function ensureDemoUser() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) return existing;

  // Password hashing is Better Auth's responsibility — a hand-written hash
  // inserted directly would not match its verification. Going through the
  // API is the only correct way to create a user outside the UI.
  await auth.api.signUpEmail({
    body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "Demo User" },
  });

  return prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } });
}

async function main() {
  const user = await ensureDemoUser();

  // Idempotent: scoped to this user's own rows, never a blanket deleteMany(),
  // so running the seed against a database with real data cannot wipe it.
  const existingOrders = await prisma.order.count({ where: { userId: user.id } });
  if (existingOrders > 0) {
    console.log(`Demo user already has ${existingOrders} order(s) — skipping (seed is idempotent).`);
    return;
  }

  for (const fixture of FIXTURES) {
    // Seeding through createOrder/recordPayment, not prisma.create, means the
    // seed exercises the same validation and overpayment guard as production
    // traffic — a fixture that violates a business rule fails the seed
    // instead of quietly creating impossible data.
    const order = await createOrder(user.id, {
      customer: fixture.customer,
      dueDate: offsetDate(fixture.dueInDays),
      items: fixture.items,
    });

    for (const payment of fixture.payments) {
      await recordPayment(user.id, order.id, payment);
    }

    console.log(`  Created order for ${fixture.customer}`);
  }

  console.log(
    `\nSeed complete. Log in with:\n  email:    ${DEMO_EMAIL}\n  password: ${DEMO_PASSWORD}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
