import { requireApiAccess } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { fishSpeechText, speechSpeed, speechStyle, speechText } from "@/lib/speech";

export const maxDuration = 30;

// Fish's free endpoint can queue. Keep the request small and bounded so a slow
// provider can never leave the companion UI in its "thinking" state indefinitely.
const upstreamTimeoutMs = 14_000;

export async function POST(request: Request) {
  const denied = await requireApiAccess(request);
  if (denied) return denied;
  const quota = rateLimit(request, "tts", 30);
  if (!quota.allowed) return rateLimitedResponse(quota.retryAfter);
  const startedAt = Date.now();
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  const voiceId = process.env.FISH_AUDIO_VOICE_ID;
  if (!apiKey) return NextResponse.json({ error: "FISH_AUDIO_API_KEY is not configured" }, { status: 500 });
  if (!voiceId) return NextResponse.json({ error: "FISH_AUDIO_VOICE_ID is not configured" }, { status: 500 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body", status: 400 }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Text is required", status: 400 }, { status: 400 });
  const { text, speed, language } = body as Record<string, unknown>;
  if (typeof text !== "string" || text.length > 5000) return NextResponse.json({ error: "Text is required and must be under 5000 characters", status: 400 }, { status: 400 });
  const speechLanguage = language === "global" || language === "en" || language === "ja" || language === "ko" || language === "zh" || language === "th" ? language : "global";
  const cleanText = speechText(text);
  if (!cleanText) return NextResponse.json({ error: "Text must contain spoken words", status: 400 }, { status: 400 });
  const style = speechStyle(cleanText);
  const model = process.env.FISH_AUDIO_MODEL ?? "s2.1-pro-free";

  let response: Response;
  try {
    response = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        model,
      },
      signal: AbortSignal.timeout(upstreamTimeoutMs),
      body: JSON.stringify({
        // The cloned voice stays the same; S2 gets a subtle delivery cue.
        text: fishSpeechText(cleanText, style, model, speechLanguage),
        reference_id: voiceId,
        prosody: { speed: speechSpeed(speed, style), volume: 0, normalize_loudness: true },
        temperature: style.temperature,
        top_p: style.topP,
        repetition_penalty: style.repetitionPenalty,
        format: "mp3",
        sample_rate: 44100,
        mp3_bitrate: 192,
        latency: "normal",
        // Fish text normalization targets English and Chinese. Leaving it off
        // preserves Thai spelling and avoids an unnatural Thai pronunciation.
        normalize: false,
        // Keep continuity between generated chunks: disabling this can make
        // longer Thai replies end after only their first phrase.
        chunk_length: 280,
        min_chunk_length: 70,
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
  console.info("Fish Audio TTS ready", { elapsedMs, textLength: cleanText.length, language: speechLanguage, delivery: style.delivery, bytes: audio.byteLength });
  return new NextResponse(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "Server-Timing": `fish;dur=${elapsedMs}` } });
}
