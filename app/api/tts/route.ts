import { NextResponse } from "next/server";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

export const maxDuration = 30;

// Fish's free endpoint can queue. Keep the request small and bounded so a slow
// provider can never leave the companion UI in its "thinking" state indefinitely.
const upstreamTimeoutMs = 14_000;

function speechText(value: string) {
  return value.split(/\n\s*แหล่งข้อมูล\s*:/i)[0]
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_~`]/g, "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    // Keep Thai and English word boundaries audible to the tokenizer.
    .replace(/([ก-๙])([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])([ก-๙])/g, "$1 $2")
    // Turn repeated words into a gentle spoken pause without removing them.
    .replace(/\b([A-Za-zก-๙]{2,})(\s+\1\b)/giu, "$1, $1")
    .replace(/([!?]){2,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function speechStyle(value: string) {
  const affectionate = /~|〜|～/.test(value);
  const exclamatory = /!|！/.test(value);
  const question = /\?|？/.test(value);
  const repeated = /\b([A-Za-zก-๙]{2,})\s+\1\b/iu.test(value);
  return {
    // Tilde is a user-facing tone cue: soften and stretch the delivery.
    speedAdjustment: affectionate ? -.05 : exclamatory ? .03 : question ? -.03 : repeated ? -.015 : 0,
    temperature: affectionate ? .72 : exclamatory ? .7 : question ? .62 : .65,
    topP: affectionate ? .8 : exclamatory ? .78 : .75,
  };
}

export async function POST(request: Request) {
  const quota = rateLimit(request, "tts", 30);
  if (!quota.allowed) return rateLimitedResponse(quota.retryAfter);
  const startedAt = Date.now();
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  const voiceId = process.env.FISH_AUDIO_VOICE_ID;
  if (!apiKey) return NextResponse.json({ error: "FISH_AUDIO_API_KEY is not configured" }, { status: 500 });
  if (!voiceId) return NextResponse.json({ error: "FISH_AUDIO_VOICE_ID is not configured" }, { status: 500 });

  const { text, speed } = (await request.json()) as { text?: string; speed?: number };
  const cleanText = text ? speechText(text) : "";
  if (!cleanText || cleanText.length > 5000) return NextResponse.json({ error: "Text is required and must be under 5000 characters" }, { status: 400 });
  const style = speechStyle(text ?? "");

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
        // Keep Thai syllables relaxed while still allowing the user's voice
        // speed preference to apply. Fish documents speed as the supported
        // prosody control; pitch is intentionally not sent because it is not
        // part of this endpoint's standard Prosody schema.
        prosody: { speed: Math.min(1.2, Math.max(.75, (Number.isFinite(speed) ? speed! : 1) + style.speedAdjustment)), volume: 0, normalize_loudness: true },
        temperature: style.temperature,
        top_p: style.topP,
        repetition_penalty: 1.2,
        format: "mp3",
        sample_rate: 44100,
        mp3_bitrate: 192,
        latency: "normal",
        // Avoid loudness reshaping on Thai audio; it can introduce clipping
        // or a metallic/distorted tone on some reference voices.
        normalize: true,
        // Keep continuity between generated chunks: disabling this can make
        // longer Thai replies end after only their first phrase.
        chunk_length: 220,
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
