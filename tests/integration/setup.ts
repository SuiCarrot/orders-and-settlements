import { afterAll, beforeEach } from "vitest";
import { hashPassword } from "better-auth/crypto";
import { dbTable, prisma } from "@/server/db/prisma";

export const TEST_USER_ID = "integration-test-user";
export const TEST_PASSWORD = "integration-password-123";
const TEST_ACCOUNT_ID = "integration-test-credential";

beforeEach(async () => {
  // Must go through dbTable() — a bare "orders" etc. would truncate the
  // `public` schema instead of `test_isolation`. See src/server/db/prisma.ts.
  await prisma.$executeRaw`TRUNCATE ${dbTable("refunds")}, ${dbTable("payments")}, ${dbTable("order_items")}, ${dbTable("order_events")}, ${dbTable("orders")} RESTART IDENTITY CASCADE`;
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

  const existingAccount = await prisma.account.findUnique({ where: { id: TEST_ACCOUNT_ID } });
  if (!existingAccount) {
    await prisma.account.create({
      data: {
        id: TEST_ACCOUNT_ID,
        accountId: TEST_USER_ID,
        providerId: "credential",
        userId: TEST_USER_ID,
        password: await hashPassword(TEST_PASSWORD),
      },
    });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
