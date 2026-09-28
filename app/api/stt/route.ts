import { NextResponse } from "next/server";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

export const maxDuration = 30;

export async function POST(request: Request) {
  const quota = rateLimit(request, "stt", 12);
  if (!quota.allowed) return rateLimitedResponse(quota.retryAfter);
  const key = process.env.GROQ_API_KEY;
  if (!key) return NextResponse.json({ error: "GROQ_API_KEY is not configured", status: 500 }, { status: 500 });
  const incoming = await request.formData(); const file = incoming.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
  if (!file.size) return NextResponse.json({ error: "Audio file is empty" }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Audio file is too large", status: 413 }, { status: 413 });
  const form = new FormData();
  form.append("file", file, file.name || "vivian-recording");
  form.append("model", process.env.GROQ_STT_MODEL ?? "whisper-large-v3-turbo");
  const requestedLanguage = incoming.get("language");
  const language = requestedLanguage === "en" || requestedLanguage === "ja" || requestedLanguage === "ko" || requestedLanguage === "zh" || requestedLanguage === "th" ? requestedLanguage : null;
  // Anchor transcription to the language selected in the companion UI; this
  // prevents the recognizer from guessing a different script from room noise.
  if (language) form.append("language", language);
  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(20000) });
  } catch (error) {
    console.warn("Groq STT timed out or failed", error);
    return NextResponse.json({ error: "ถอดเสียงไม่สำเร็จ ลองใหม่อีกครั้งนะคะ" }, { status: 504 });
  }
  if (!response.ok) {
    console.warn("Groq STT rejected", { status: response.status, mimeType: file.type, size: file.size });
    return NextResponse.json({ error: "Groq STT request failed", status: response.status }, { status: response.status });
  }
  const data: unknown = await response.json();
  const text = typeof data === "object" && data !== null && "text" in data && typeof data.text === "string" ? data.text : "";
  console.info("Groq STT complete", { mimeType: file.type, size: file.size, language });
  return NextResponse.json({ text });
}
