import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-muted-foreground text-sm">
            Orders and Settlements — sign in to manage your orders.
          </p>
        </div>
        {/* useSearchParams requires a Suspense boundary in the App Router */}
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
