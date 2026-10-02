import type { User } from "@supabase/supabase-js";

// Authorization uses the Auth server's verified user record, not user_metadata.
const allowedEmails = new Set([
  "suphloeksangko@gmail.com",
  "duckchan690@gmail.com",
]);

export function isAllowedUser(user: Pick<User, "email" | "email_confirmed_at" | "is_anonymous"> | null): boolean {
  return Boolean(user && !user.is_anonymous && user.email_confirmed_at &&
    allowedEmails.has(user.email?.trim().toLowerCase() ?? ""));
}

export function isSameOriginMutation(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  // Next may normalize request.url to its internal hostname. Host identifies
  // the origin the browser actually requested; no forwarded-host redirect is used.
  const target = new URL(request.url);
  const host = request.headers.get("host");
  if (host) target.host = host;
  return origin === target.origin;
}
