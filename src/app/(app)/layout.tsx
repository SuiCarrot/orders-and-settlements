import { redirect } from "next/navigation";
import { requireUser, UnauthenticatedError } from "@/server/auth/require-user";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts already redirects logged-out visitors optimistically (cookie
  // presence only). This is the real check: if the session turns out to be
  // invalid, redirect properly instead of letting the error boundary render.
  const user = await requireUser().catch((error) => {
    if (error instanceof UnauthenticatedError) redirect("/login");
    throw error;
  });

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="font-semibold">Orders and Settlements</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">{user.email}</span>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
