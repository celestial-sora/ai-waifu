import { sceneApi } from "@/lib/scene-api";
import { getSceneLibrary, saveScene } from "@/lib/scene-store";
import { normalizeSceneImage, readSceneInput } from "@/lib/scene-images";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return sceneApi(request, async (db, userId) => Response.json(await getSceneLibrary(db, userId)));
}
export async function POST(request: Request) {
  return sceneApi(request, async (db, userId) => {
    const input = await readSceneInput(request);
    const image = input.bytes && input.mime ? await normalizeSceneImage(input.bytes, input.mime) : {};
    return Response.json({ scene: await saveScene(db, userId, { ...input, ...image }) }, { status: 201 });
  });
}
