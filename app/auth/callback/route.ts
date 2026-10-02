import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/auth/server";
import { isAllowedUser } from "@/lib/auth/policy";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const login = (error: string): NextResponse => new NextResponse(null, { status: 303, headers: { Location: `/login?error=${error}`, "Cache-Control": "private, no-store" } });
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.has("error")) return login("oauth_failed");
  try {
    const supabase = await createAuthServerClient();
    if (!supabase) return login("auth_unavailable");
    const flowId = url.searchParams.get("sb_flow_id");
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error) return login("oauth_failed");
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      await supabase.auth.signOut({ scope: "local" });
      return login("oauth_failed");
    }
    if (!isAllowedUser(user)) {
      await supabase.auth.signOut({ scope: "local" });
      return login("access_denied");
    }
    // Always return to the companion; no user-controlled redirect destination.
    return new NextResponse(null, { status: 303, headers: { Location: "/", "Cache-Control": "private, no-store" } });
  } catch {
    return login("auth_unavailable");
  }
}
