import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/auth/server";
import { isSameOriginMutation } from "@/lib/auth/policy";

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Cross-site request rejected", status: 403 }, { status: 403 });
  try {
    const supabase = await createAuthServerClient();
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) return NextResponse.json({ error: "Could not sign out. Please try again.", status: 503 }, { status: 503 });
    }
    return new NextResponse(null, { status: 303, headers: { Location: "/login", "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not sign out. Please try again.", status: 503 }, { status: 503 });
  }
}
