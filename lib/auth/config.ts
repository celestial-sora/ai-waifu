import "server-only";

export interface AuthConfiguration {
  url: string;
  publishableKey: string;
}

export function getAuthConfiguration(): AuthConfiguration | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim();
  const publishableKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  if (!url || !publishableKey) return null;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    if (publishableKey.startsWith("sb_secret_") || publishableKey === process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
    if (!publishableKey.startsWith("sb_publishable_")) {
      const payload = publishableKey.split(".")[1];
      if (!payload || JSON.parse(Buffer.from(payload, "base64url").toString()).role !== "anon") return null;
    }
    // Only a publishable/anon key is used for Auth, never the admin key.
    return { url, publishableKey };
  } catch {
    return null;
  }
}
