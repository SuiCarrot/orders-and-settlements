# Phase 3 — Authentication

**Goal.** Email and password authentication with sessions persisted in the same Postgres database,
plus a single `requireUser()` helper that every protected code path calls.

**Definition of done.** A new account can be registered, logged in, and logged out. Visiting
`/dashboard` while logged out redirects to `/login`. Calling `GET /api/orders` without a session
returns `401` with the standard error shape.

---

## Why Better Auth

The assignment says email and password is sufficient and does not evaluate authentication, so the
goal is a correct, boring implementation that consumes as little of the budget as possible.

Auth.js v5 was the obvious default until early 2026, when the project entered maintenance mode and
its maintainers began directing new projects to Better Auth. Better Auth keeps user data in our own
Neon database — a reviewer only needs `DATABASE_URL` to run the project, with no third-party
account to provision — and its sessions are rows in a `sessions` table rather than stateless JWTs,
which means logout and session revocation actually work server-side. For an application about
financial records, being able to revoke a session is not a small detail.

Hand-rolling auth was considered and rejected. The happy path is genuinely small, but the version
worth defending in a fintech code review — rate limiting, lockout, enumeration-safe responses,
password reset, revocation, audit trail — is one to two days of work in an area the assignment
explicitly excluded from evaluation. That reasoning is recorded in
[11-production-roadmap.md](11-production-roadmap.md) rather than being silently omitted.

## Step 1 — Install

```bash
npm install better-auth @better-auth/prisma-adapter
```

The adapter package must be installed, but the import comes from `better-auth/adapters/prisma`.

Generate a secret:

```bash
openssl rand -base64 32
```

Put it in `.env` as `BETTER_AUTH_SECRET`, alongside `BETTER_AUTH_URL="http://localhost:3000"`.

## Step 2 — Server instance

`src/server/auth/auth.ts`:

```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/server/db/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    // Email verification is out of scope for this assignment; see the production roadmap.
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  plugins: [nextCookies()], // must stay last
});
```

`nextCookies()` must be the final plugin in the array. Without it, server actions that sign a user
in will succeed but never actually set the cookie, which produces a login that appears to work and
then silently does not.

Password hashing is handled by Better Auth using scrypt. No bcrypt dependency is needed, which also
sidesteps bcrypt's silent 72-byte truncation and the native-binding problems it causes on Vercel.

## Step 3 — Generate the auth schema

```bash
npx auth@latest generate --config src/server/auth/auth.ts -y
```

(`--config` is required since the auth instance doesn't live at the project root; `-y` skips the
interactive confirmation prompt.)

This appends `User`, `Session`, `Account` and `Verification` models to `prisma/schema.prisma`. Then
add the back-relation to `User` by hand and uncomment the `user` field on `Order` from
[02-database.md](02-database.md):

```prisma
model User {
  // ... generated fields ...
  orders Order[]
}
```

Migrate:

```bash
npx prisma migrate dev --name add_auth_tables
```

The Better Auth CLI generates schema but does not run migrations for Prisma — that stays with
`prisma migrate`, which is what we want anyway since migrations are versioned in the repository.

## Step 4 — Route handler and client

`src/app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

`src/server/auth/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
export const { signIn, signUp, signOut, useSession } = authClient;
```

## Step 5 — The `requireUser` helper

This is the single most important file in the phase. Every protected route handler and server
component starts by calling it.

`src/server/auth/require-user.ts`:

```ts
import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./auth";

export class UnauthenticatedError extends Error {
  constructor() {
    super("Authentication required.");
  }
}

/** Returns the signed-in user, or throws. Deduplicated per request render. */
export const requireUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new UnauthenticatedError();
  return session.user;
});
```

`cache()` deduplicates the session lookup within a single request, so a page that renders three
server components does one database read instead of three.

`UnauthenticatedError` is mapped to a `401` response by the error handler introduced in
[05-orders-api.md](05-orders-api.md), which keeps route handlers free of auth branching.

## Step 6 — `proxy.ts`

At the project root — **not** `middleware.ts`, which Next.js 16 renamed.

```ts
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/orders/:path*"],
};
```

**This is not a security boundary and must not be treated as one.** `getSessionCookie` checks that
a cookie exists; it does not validate it. Anyone can set a cookie by hand. Worse, CVE-2025-29927
showed that Next.js middleware can be skipped entirely by spoofing the `x-middleware-subrequest`
header.

The proxy exists purely so a logged-out visitor gets a fast redirect instead of a flash of an empty
dashboard. Authorization is enforced in [05-orders-api.md](05-orders-api.md) and every page, by
`requireUser()` plus a `userId` filter on every query. The README says this explicitly, because a
reviewer at a financial company will look for exactly this mistake.

## Step 7 — Login and register pages

Both are client components using `authClient`, styled with the shadcn `field`, `input` and `button`
primitives (via `Controller` from React Hook Form, per [08-order-detail.md](08-order-detail.md)),
and validated with the shared Zod schemas from `src/lib/schemas/auth.ts`.

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "@/server/auth/auth-client";

export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/dashboard";

  async function onSubmit(values: { email: string; password: string }) {
    const { error } = await signIn.email({ ...values, callbackURL: next });
    if (error) {
      // One message for both "unknown email" and "wrong password" — never reveal
      // which accounts exist.
      setFormError("Invalid email or password.");
      return;
    }
    router.push(next);
  }
  // ...
}
```

Two details worth keeping:

- The error message is identical for an unknown email and a wrong password. Distinguishing them
  turns the login form into a user-enumeration oracle.
- The `next` query parameter is validated to be a relative path before redirecting, otherwise it is
  an open redirect.

Add a header with the user's email and a sign-out button wired to `signOut()`, then
`router.refresh()`.

## Step 8 — Commit

```bash
git commit -am "feat: add email and password authentication with better auth"
```
