import { NextResponse } from "next/server";

export const maxDuration = 30;

// Fish's free endpoint can queue. Keep the request small and bounded so a slow
// provider can never leave the companion UI in its "thinking" state indefinitely.
const upstreamTimeoutMs = 14_000;
const maxSpeechChars = 420;

function speechText(value: string) {
  const withoutSources = value.split(/\n\s*แหล่งข้อมูล\s*:/i)[0]
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutSources.length <= maxSpeechChars) return withoutSources;
  const shortened = withoutSources.slice(0, maxSpeechChars);
  const sentenceEnd = Math.max(shortened.lastIndexOf("ค่ะ"), shortened.lastIndexOf("ครับ"), shortened.lastIndexOf("."), shortened.lastIndexOf("?"), shortened.lastIndexOf("!"));
  return (sentenceEnd > 180 ? shortened.slice(0, sentenceEnd + 1) : shortened).trim();
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  const voiceId = process.env.FISH_AUDIO_VOICE_ID;
  if (!apiKey) return NextResponse.json({ error: "FISH_AUDIO_API_KEY is not configured" }, { status: 500 });
  if (!voiceId) return NextResponse.json({ error: "FISH_AUDIO_VOICE_ID is not configured" }, { status: 500 });

  const { text } = (await request.json()) as { text?: string };
  const cleanText = text ? speechText(text) : "";
  if (!cleanText || cleanText.length > 5000) return NextResponse.json({ error: "Text is required and must be under 5000 characters" }, { status: 400 });

  let response: Response;
  try {
    response = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        model: process.env.FISH_AUDIO_MODEL ?? "s2.1-pro-free",
      },
      signal: AbortSignal.timeout(upstreamTimeoutMs),
      body: JSON.stringify({
        text: cleanText,
        reference_id: voiceId,
        prosody: { speed: 0.95, volume: 0, normalize_loudness: true },
        format: "mp3",
        // Balanced retains quality while prioritising the first playable audio.
        sample_rate: 32000,
        mp3_bitrate: 64,
        latency: "balanced",
        normalize: true,
        // Keep continuity between generated chunks: disabling this can make
        // longer Thai replies end after only their first phrase.
        chunk_length: 200,
      }),
    });
  } catch (error) {
    console.warn("Fish Audio TTS unavailable", { elapsedMs: Date.now() - startedAt, textLength: cleanText.length, error: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "ผู้ให้บริการเสียงตอบช้าเกินไป ลองใหม่อีกครั้งนะคะ", code: "TTS_TIMEOUT" }, { status: 504, headers: { "Cache-Control": "no-store" } });
  }

  if (!response.ok) {
    console.warn("Fish Audio TTS rejected", { status: response.status, elapsedMs: Date.now() - startedAt, textLength: cleanText.length });
    return NextResponse.json({ error: "Fish Audio TTS request failed", code: "TTS_UPSTREAM" }, { status: response.status, headers: { "Cache-Control": "no-store" } });
  }
  const audio = await response.arrayBuffer();
  const elapsedMs = Date.now() - startedAt;
  console.info("Fish Audio TTS ready", { elapsedMs, textLength: cleanText.length, bytes: audio.byteLength });
  return new NextResponse(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "Server-Timing": `fish;dur=${elapsedMs}` } });
}
