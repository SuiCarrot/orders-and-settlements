import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`.
 *
 * IMPORTANT: this is not a security boundary. `getSessionCookie` only checks
 * that a cookie exists — it does not validate it, and Next.js middleware/proxy
 * can itself be bypassed by spoofing the `x-middleware-subrequest` header
 * (CVE-2025-29927). This exists purely to redirect a logged-out visitor away
 * from a page that would otherwise flash empty before failing. Real
 * authorization happens in every route handler and server component via
 * `requireUser()` (see src/server/auth/require-user.ts), scoped by `userId`
 * on every query.
 */
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
