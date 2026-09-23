import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const expectedToken = process.env.VIVIAN_DESKTOP_TOKEN;

  // Production web deployments do not set this variable, so their API
  // behavior stays unchanged. Packaged Desktop Pet runtime sets a fresh
  // per-launch token and Electron injects it into local API requests.
  if (!expectedToken) return NextResponse.next();

  const providedToken = request.headers.get("x-vivian-desktop-token");
  if (providedToken !== expectedToken) {
    return NextResponse.json(
      { error: "Vivian desktop API authorization required" },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
