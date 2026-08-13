/**
 * Only allow redirecting to a relative, in-app path. Without this check, a
 * `?next=` query parameter becomes an open redirect: an attacker sends a
 * victim a link like `/login?next=https://evil.example`, and after a
 * legitimate login the victim is bounced off-site.
 */
export function safeRedirectPath(path: string | null | undefined, fallback = "/dashboard"): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return fallback;
  return path;
}
