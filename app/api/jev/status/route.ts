import { requireApiAccess } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { jevEnabled } from "@/lib/jev";

export async function GET(request: Request): Promise<NextResponse> {
  const denied = await requireApiAccess(request);
  if (denied) return denied;
  return NextResponse.json(
    { configured: jevEnabled() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
