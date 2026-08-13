import { redirect } from "next/navigation";

// The landing URL a reviewer opens. Unauthenticated visitors bounce to /login
// via the app layout's requireUser() check; signed-in visitors land on the dashboard.
export default function Home() {
  redirect("/dashboard");
}
