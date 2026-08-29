import { NextResponse } from "next/server";

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });

  const body = (await request.json()) as { messages?: ChatMessage[] };
  const messages = body.messages ?? [];
  const contents = messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL ?? "gemini-2.5-flash"}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: "You are Yuino, a warm, kind AI companion. Reply naturally and concisely in Thai unless the user asks for another language." }] },
      contents,
      generationConfig: { temperature: 0.8, maxOutputTokens: 500 },
    }),
  });
  if (!response.ok) return NextResponse.json({ error: "Gemini request failed", detail: await response.text() }, { status: response.status });
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return NextResponse.json({ error: "Gemini returned no text" }, { status: 502 });
  return NextResponse.json({ text });
}
