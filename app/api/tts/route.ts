import { NextResponse } from "next/server";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

export const maxDuration = 30;

// Fish's free endpoint can queue. Keep the request small and bounded so a slow
// provider can never leave the companion UI in its "thinking" state indefinitely.
const upstreamTimeoutMs = 14_000;

function speechText(value: string) {
  return value.split(/\n\s*แหล่งข้อมูล\s*:/i)[0]
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request: Request) {
  const quota = rateLimit(request, "tts", 30);
  if (!quota.allowed) return rateLimitedResponse(quota.retryAfter);
  const startedAt = Date.now();
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  const voiceId = process.env.FISH_AUDIO_VOICE_ID;
  if (!apiKey) return NextResponse.json({ error: "FISH_AUDIO_API_KEY is not configured" }, { status: 500 });
  if (!voiceId) return NextResponse.json({ error: "FISH_AUDIO_VOICE_ID is not configured" }, { status: 500 });

  const { text, speed, pitch } = (await request.json()) as { text?: string; speed?: number; pitch?: number };
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
        // Keep the original voice delivery natural; the reference voice and
        // punctuation already carry Vivian's conversational expression.
        text: cleanText,
        reference_id: voiceId,
        // Keep the reference voice's native cadence. Overriding it with a
        // faster speed made Thai syllables sound stretched/"เหน่อ".
        prosody: { speed: 1, volume: 0 },
        temperature: 0.7,
        top_p: 0.7,
        repetition_penalty: 1.2,
        format: "mp3",
        sample_rate: 44100,
        mp3_bitrate: 192,
        latency: "normal",
        // Avoid loudness reshaping on Thai audio; it can introduce clipping
        // or a metallic/distorted tone on some reference voices.
        normalize: false,
        // Keep continuity between generated chunks: disabling this can make
        // longer Thai replies end after only their first phrase.
        chunk_length: 300,
        min_chunk_length: 50,
        condition_on_previous_chunks: true,
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
