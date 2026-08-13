# Phase 10 — Deploy

**Goal.** A publicly accessible URL running the application against a Neon database, with
migrations applied automatically on deploy.

**Definition of done.** A stranger can open the URL, register an account, create an order, record a
payment, and be rejected when overpaying. `BASE_URL=<live-url> npm run verify:scenario` passes.

Deployment is a hard requirement of the assignment, not a bonus. It is worth doing early enough
that a build failure is discovered with time to fix it, rather than at hour eight.

---

## Step 1 — Prepare the build

```json
{
  "scripts": {
    "build": "prisma generate && prisma migrate deploy && next build"
  }
}
```

`migrate deploy` applies pending migrations without prompting and never generates new ones, which
is the correct command for a non-interactive environment. Running it in `build` keeps schema and
code in the same atomic unit: a deploy that cannot migrate also cannot ship.

The trade-off, which belongs in the README: with a single database this briefly runs the new schema
against the old code while the deployment rolls over. Fine for a take-home, and the roadmap
describes the expand-and-contract pattern that solves it properly.

## Step 2 — Import to Vercel

Import the repository, keep the Next.js preset defaults, and set the environment variables before
the first build — a build without `DATABASE_URL` fails at `migrate deploy`.

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Neon **pooled** string (hostname contains `-pooler`) |
| `DIRECT_URL` | Neon **direct** string |
| `BETTER_AUTH_SECRET` | Fresh `openssl rand -base64 32` — not the development one |
| `BETTER_AUTH_URL` | The production URL, e.g. `https://orders-and-settlements.vercel.app` |

Two things that silently break if rushed:

- **`BETTER_AUTH_URL` must match the deployed origin exactly**, including protocol and no trailing
  slash. A mismatch produces callbacks that appear to work locally and fail in production.
- **Reuse the development secret and every existing session stays valid across environments.**
  Generate a separate one.

Preview deployments get their own generated URL, which will not match `BETTER_AUTH_URL`. Either
scope the variable to production only and let previews use Vercel's `VERCEL_URL`, or accept that
auth works only on production. Note whichever you choose in the README.

## Step 3 — Connection strings in production

The pooled string routes through Neon's PgBouncer. Every Vercel instance opens its own pool, and
without pooling a few concurrent requests exhaust Neon's connection limit.

```
DATABASE_URL="postgresql://...-pooler.../neondb?sslmode=require&connect_timeout=15"
```

`connect_timeout=15` matters on a free tier: Neon scales compute to zero after inactivity, and a
cold start takes a few seconds. The default timeout produces an intermittent `P1001` on the first
request after idle — precisely the request a reviewer makes when they open the link.

The interactive transaction from [06-payments-api.md](06-payments-api.md) works through PgBouncer's
transaction mode because `@prisma/adapter-neon` holds a WebSocket connection for the duration of
the transaction. This is worth verifying in production rather than assuming: run the concurrency
check against the deployed URL.

## Step 4 — Seed production

```bash
DATABASE_URL="<production-pooled>" DIRECT_URL="<production-direct>" npm run db:seed
```

Put the demo credentials in the README and the submission email. A reviewer who has to register an
account before seeing anything is a reviewer looking at an empty dashboard.

## Step 5 — Verify the live deployment

```bash
BASE_URL="https://<your-app>.vercel.app" npm run verify:scenario
```

Then manually confirm the things a script cannot: registration and login work, the dashboard
renders with real data, the status filter changes the list, an order detail page opens, recording a
payment updates status without a reload, and overpaying shows the actionable error.

Also check that `/dashboard` while logged out redirects to `/login`, and that
`curl https://<app>/api/orders` without a cookie returns `401` and not an empty list. The second
one is the difference between a working authorization boundary and one that only appears to work.

## Step 6 — Commit

```bash
git commit -am "chore: configure vercel deployment with automatic migrations"
```
