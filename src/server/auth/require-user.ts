import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./auth";

export class UnauthenticatedError extends Error {
  constructor() {
    super("Authentication required.");
  }
}

/**
 * Returns the signed-in user, or throws `UnauthenticatedError`.
 *
 * This — not `proxy.ts` — is the actual authorization boundary. Cached per
 * request render with React's `cache()` so a page rendering several server
 * components does one session lookup instead of one per component.
 */
export const requireUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new UnauthenticatedError();
  return session.user;
});
