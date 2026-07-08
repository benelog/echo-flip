// Where to land after sign-in, carried via sessionStorage because the OAuth
// round-trip leaves the app entirely.
export const AUTH_NEXT_KEY = "auth-next";

// Only same-app paths are honored so a crafted ?next= link can't bounce the
// visitor to another origin after sign-in.
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
