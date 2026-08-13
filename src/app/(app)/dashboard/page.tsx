import { requireUser } from "@/server/auth/require-user";

// Placeholder — replaced with the full dashboard (order list, status filter,
// pagination) in phase 7. This exists in phase 3 only to prove the auth flow
// works end to end: register, login, protected route, logout.
export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <main className="mx-auto max-w-6xl space-y-2 p-6">
      <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>
      <p className="text-muted-foreground text-sm">
        The orders dashboard will be built in a later phase.
      </p>
    </main>
  );
}
