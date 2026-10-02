import { requireApiAccess } from "@/lib/auth/server";
import { NextResponse } from "next/server";

export async function GET(request: Request): Promise<NextResponse> {
  const denied = await requireApiAccess(request);
  if (denied) return denied;
  return NextResponse.json(
    { configured: Boolean(process.env.TYPESAFE_API_KEY?.trim() || process.env.JEV_API_KEY?.trim()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
