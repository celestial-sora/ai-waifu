import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16.3's Vercel adapter currently conflicts with standalone output:
  // Vercel does not consume the standalone bundle anyway, while Desktop does.
  // Keep the normal Vercel build path untouched and emit standalone everywhere
  // else (local desktop builds and the Windows packaging workflow).
  output: process.env.VERCEL ? undefined : "standalone",
};

export default nextConfig;
