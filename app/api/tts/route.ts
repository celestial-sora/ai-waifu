import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured" }, { status: 500 });
  const { text } = (await request.json()) as { text?: string };
  if (!text?.trim()) return NextResponse.json({ error: "Text is required" }, { status: 400 });
  const voice = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, { method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" }, body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_TTS_MODEL ?? "eleven_flash_v2_5", language_code: "th" }) });
  if (!response.ok) return NextResponse.json({ error: "ElevenLabs TTS request failed", detail: await response.text() }, { status: response.status });
  return new NextResponse(await response.arrayBuffer(), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
