import { NextResponse } from "next/server";

export function GET(): NextResponse {
  return NextResponse.json(
    { configured: Boolean(process.env.TYPESAFE_API_KEY?.trim() || process.env.JEV_API_KEY?.trim()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
