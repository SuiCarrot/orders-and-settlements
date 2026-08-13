import { hashPassword, verifyPassword } from "better-auth/crypto";
import { prisma } from "@/server/db/prisma";

export class InvalidPasswordError extends Error {
  readonly code = "INVALID_PASSWORD";

  constructor() {
    super("The password is incorrect.");
  }
}

/**
 * Re-checks the signed-in user's credential password. Used as a step-up before
 * mutating or deleting an order — a valid session cookie is not enough.
 */
export async function confirmCurrentPassword(userId: string, password: string): Promise<void> {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { password: true },
  });

  if (!account?.password) {
    await hashPassword(password);
    throw new InvalidPasswordError();
  }

  const matches = await verifyPassword({ hash: account.password, password });
  if (!matches) throw new InvalidPasswordError();
}
