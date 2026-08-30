import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(request: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured" }, { status: 500 });
  const incoming = await request.formData(); const file = incoming.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
  if (!file.size) return NextResponse.json({ error: "Audio file is empty" }, { status: 400 });
  const form = new FormData();
  form.append("file", file, file.name || "vivian-recording");
  form.append("model_id", "scribe_v2");
  // Thai is the app's primary language. Keeping the recognizer anchored to
  // Thai prevents room noise from being hallucinated as Chinese/Spanish,
  // while English names and short phrases can still appear in Thai speech.
  form.append("language_code", "th");
  form.append("num_speakers", "1");
  form.append("tag_audio_events", "false");
  let response: Response;
  try {
    response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body: form, signal: AbortSignal.timeout(20000) });
  } catch (error) {
    console.warn("ElevenLabs STT timed out or failed", error);
    return NextResponse.json({ error: "ถอดเสียงไม่สำเร็จ ลองใหม่อีกครั้งนะคะ" }, { status: 504 });
  }
  if (!response.ok) {
    console.warn("ElevenLabs STT rejected", { status: response.status, mimeType: file.type, size: file.size });
    return NextResponse.json({ error: "ElevenLabs STT request failed" }, { status: response.status });
  }
  const data = await response.json();
  console.info("ElevenLabs STT complete", { mimeType: file.type, size: file.size, language: data.language_code, confidence: data.language_probability });
  return NextResponse.json({ text: data.text ?? "" });
}
