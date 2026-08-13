import { afterAll, beforeEach } from "vitest";
import { dbTable, prisma } from "@/server/db/prisma";

export const TEST_USER_ID = "integration-test-user";

beforeEach(async () => {
  // Must go through dbTable() — a bare "orders" etc. would truncate the
  // `public` schema instead of `test_isolation`. See src/server/db/prisma.ts.
  await prisma.$executeRaw`TRUNCATE ${dbTable("payments")}, ${dbTable("order_items")}, ${dbTable("orders")} RESTART IDENTITY CASCADE`;
  // Orders have a FK to users, so a stable test user must exist. Never
  // truncated — only orders/items/payments reset between tests.
  await prisma.user.upsert({
    where: { id: TEST_USER_ID },
    update: {},
    create: {
      id: TEST_USER_ID,
      name: "Integration Test User",
      email: "integration-test@example.com",
      emailVerified: true,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
