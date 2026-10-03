import { sceneApi } from "@/lib/scene-api";
import { readBoundedSceneBody } from "@/lib/scene-images";
import { setScenePreferences } from "@/lib/scene-store";
export async function PATCH(request: Request) {
  return sceneApi(request, async (db, userId) => {
    // Small preference payloads do not need multipart parsing.
    const body = (await readBoundedSceneBody(request, 2048)).toString("utf8");
    return Response.json({ preferences: await setScenePreferences(db, userId, JSON.parse(body)) });
  });
}
