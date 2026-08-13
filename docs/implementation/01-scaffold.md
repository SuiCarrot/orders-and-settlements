# Phase 1 — Scaffold

**Goal.** A Next.js 16 app that boots, lints, and runs an empty test suite, with the folder
structure the rest of the build assumes already in place.

**Definition of done.** `npm run dev`, `npm run lint`, `npm run typecheck` and `npm test` all
succeed on a clean checkout.

---

## Step 1 — Create the app

The repository already exists and contains `docs/` and `LICENSE`, so scaffold into the current
directory rather than a new one.

```bash
npx create-next-app@latest . \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-npm
```

Answer no to overwriting `README.md` if prompted; it is replaced deliberately in step 6.

## Step 2 — Install dependencies

```bash
# Runtime
npm install zod date-fns react-hook-form @hookform/resolvers

# Tooling
npm install -D vitest vite-tsconfig-paths prettier prettier-plugin-tailwindcss tsx
```

`react-hook-form` and `@hookform/resolvers` are installed explicitly to pin the versions.
**`@hookform/resolvers` must be 5.1.0 or newer** — Zod 4 support landed there, and an older
resolver fails at runtime against a Zod 4 schema with an unhandled `ZodError` rather than a
validation message. See the typing note in [08-order-detail.md](08-order-detail.md).

`@vitejs/plugin-react` is deliberately **not** installed. Nothing in this project renders React
components under Vitest — the test suite targets pure domain functions and service-layer
integration tests, both plain Node. Adding the plugin also collides: `shadcn` (added as a project
dependency by its own CLI) pulls in a Babel 7 toolchain, while `@vitejs/plugin-react`'s optional
Rolldown integration wants Babel 8, and npm's peer resolution fails outright. Skipping the plugin
avoids the conflict rather than papering over it with `--legacy-peer-deps`.

Database and auth packages are installed in their own phases, so a failure there does not leave
this one half-done.

`date-fns` is used only for display formatting and for the UTC date boundary helper. Status
derivation itself stays dependency-free so it can be unit tested in isolation.

## Step 3 — Add shadcn/ui

```bash
npx shadcn@latest init -d
npx shadcn@latest add button input label card table badge dialog select field sonner alert
```

`shadcn` copies component source into `src/components/ui/` instead of adding a dependency, which
keeps the UI layer fully readable and editable in place.

**`form` is not in that list.** shadcn deprecated the RHF-coupled `Form` wrapper in October 2025 in
favour of the form-library-agnostic `Field` family (`Field`, `FieldGroup`, `FieldLabel`,
`FieldError`). Forms are built with `react-hook-form`'s own `Controller` plus `Field` for layout —
see [08-order-detail.md](08-order-detail.md) for the pattern. Requesting `form` from the registry
now returns an empty component with no error, which is easy to mistake for a flaky install rather
than a deliberate deprecation.

## Step 4 — Configure Vitest

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    coverage: { include: ["src/server/domain/**", "src/server/services/**"] },
  },
});
```

Two test projects share this config but are run separately, because they have different
requirements:

- `tests/unit/**` — pure functions, no I/O, milliseconds to run.
- `tests/integration/**` — hits a real Postgres branch, wired up in [06-payments-api.md](06-payments-api.md).

## Step 5 — Create the folder structure

```
src/
  app/
    (auth)/login/page.tsx
    (auth)/register/page.tsx
    (app)/dashboard/page.tsx
    (app)/orders/[id]/page.tsx
    api/
  server/
    domain/          # pure business rules, zero imports from infrastructure
    services/        # orchestration + transactions
    db/
    auth/
    http/
  lib/
    schemas/         # zod, shared between route handlers and forms
    format.ts        # display-only formatting
  components/
    ui/              # shadcn
proxy.ts
prisma/
tests/
  unit/
  integration/
```

The one rule that matters here: **`src/server/domain/` may not import from anywhere else.** No
Prisma, no Next, no auth. That constraint is what makes the money and status logic testable
without a database, and it is the clearest signal of separation of concerns in the codebase.

## Step 6 — Scripts and environment

`package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "tsx prisma/seed.ts"
  }
}
```

`.env.example` — committed; `.env` stays ignored:

```ini
# Neon pooled connection (has -pooler in the hostname) — used by the application
DATABASE_URL="postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require"
# Neon direct connection — used by Prisma CLI for migrations
DIRECT_URL="postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"

# openssl rand -base64 32
BETTER_AUTH_SECRET="replace-me"
BETTER_AUTH_URL="http://localhost:3000"
```

Replace the placeholder root `README.md` with a short "work in progress" stub. It is written for
real in [12-readme.md](12-readme.md), but leaving another project's name in it through ten commits
is the kind of detail that gets noticed.

## Step 7 — Commit

```bash
git add -A && git commit -m "chore: scaffold next.js app with tooling and folder structure"
```
