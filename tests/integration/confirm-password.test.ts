import { describe, expect, it } from "vitest";
import { confirmCurrentPassword, InvalidPasswordError } from "@/server/auth/confirm-password";
import { TEST_PASSWORD, TEST_USER_ID } from "./setup";

describe("confirmCurrentPassword", () => {
  it("accepts the signed-in user's password", async () => {
    await expect(confirmCurrentPassword(TEST_USER_ID, TEST_PASSWORD)).resolves.toBeUndefined();
  });

  it("rejects a wrong password", async () => {
    await expect(confirmCurrentPassword(TEST_USER_ID, "definitely-wrong")).rejects.toBeInstanceOf(
      InvalidPasswordError,
    );
  });
});
