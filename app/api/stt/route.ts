import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(request: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured" }, { status: 500 });
  const incoming = await request.formData(); const file = incoming.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
  const form = new FormData(); form.append("file", file); form.append("model_id", "scribe_v2"); form.append("language_code", "tha");
  let response: Response;
  try {
    response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body: form, signal: AbortSignal.timeout(20000) });
  } catch (error) {
    console.warn("ElevenLabs STT timed out or failed", error);
    return NextResponse.json({ error: "ถอดเสียงไม่สำเร็จ ลองใหม่อีกครั้งนะคะ" }, { status: 504 });
  }
  if (!response.ok) return NextResponse.json({ error: "ElevenLabs STT request failed", detail: await response.text() }, { status: response.status });
  const data = await response.json(); return NextResponse.json({ text: data.text ?? "" });
}
