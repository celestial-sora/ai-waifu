import { sceneApi } from "@/lib/scene-api";
import { getSceneImage } from "@/lib/scene-store";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return sceneApi(request, async (db, userId) => new Response(await getSceneImage(db, userId, (await context.params).id, new URL(request.url).searchParams.get("thumbnail") === "1"), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=0, must-revalidate", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline", Vary: "Cookie, Authorization" },
  }));
}
