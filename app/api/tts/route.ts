import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  const voiceId = process.env.FISH_AUDIO_VOICE_ID;
  if (!apiKey) return NextResponse.json({ error: "FISH_AUDIO_API_KEY is not configured" }, { status: 500 });
  if (!voiceId) return NextResponse.json({ error: "FISH_AUDIO_VOICE_ID is not configured" }, { status: 500 });

  const { text } = (await request.json()) as { text?: string };
  const cleanText = text?.trim();
  if (!cleanText || cleanText.length > 5000) return NextResponse.json({ error: "Text is required and must be under 5000 characters" }, { status: 400 });

  const response = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      model: process.env.FISH_AUDIO_MODEL ?? "s2.1-pro-free",
    },
    body: JSON.stringify({
      text: cleanText,
      reference_id: voiceId,
      prosody: { speed: 0.95, volume: 0, normalize_loudness: true },
      format: "mp3",
      sample_rate: 44100,
      mp3_bitrate: 128,
      latency: "normal",
      normalize: true,
      chunk_length: 300,
    }),
  });

  if (!response.ok) return NextResponse.json({ error: "Fish Audio TTS request failed", detail: await response.text() }, { status: response.status });
  return new NextResponse(await response.arrayBuffer(), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
