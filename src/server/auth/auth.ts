import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/server/db/prisma";

/**
 * Prefer the explicit BETTER_AUTH_URL (set in production to the canonical
 * origin). Fall back to Vercel's generated URL so preview deployments and the
 * first production build — before the custom domain is known — still have a
 * matching origin for CSRF and cookie callbacks.
 */
function resolveBaseURL() {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

const baseURL = resolveBaseURL();

export const auth = betterAuth({
  baseURL,
  trustedOrigins: [baseURL],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    // Email verification is out of scope for this assignment; see docs/production-roadmap.md.
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh once per day of activity
  },
  plugins: [nextCookies()], // must stay last — see docs/implementation/03-auth.md
});
