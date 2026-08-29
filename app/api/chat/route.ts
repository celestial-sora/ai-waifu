import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type ChatMessage = { role: "user" | "assistant"; content: string };
type StoredMemory = { memory: string; category: string; importance: number };

const userKey = "default";
const modelName = () => process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const searchIntent = /(ค้นหา|search|หาให้หน่อย|ข่าว|ล่าสุด|วันนี้|ราคา|current|latest|look up|ออนไลน์|บนเว็บ|ในเน็ต)/i;
const memoryIntent = /(จำไว้|จำว่า|เรียกฉันว่า|ชื่อของฉัน|ฉันชอบ|ฉันไม่ชอบ|ความชอบ|favorite|prefer|my name|remember|call me)/i;
const maxHistoryChars = 12000;

async function callGemini(apiKey: string, payload: Record<string, unknown>) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName()}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(payload),
  });
}

async function extractMemories(apiKey: string, userText: string) {
  if (userText.length < 12) return [];
  const response = await callGemini(apiKey, {
    systemInstruction: { parts: [{ text: "Extract only durable, useful user facts from the message. Never save secrets, passwords, API keys, one-time requests, precise location, health, financial, or highly sensitive information. Return strict JSON only: {\"memories\":[{\"memory\":\"short Thai fact\",\"category\":\"preference|profile|project|relationship\",\"importance\":1-5}]}. Return an empty list unless the user explicitly states a lasting preference, identity detail, ongoing project fact, or recurring preference. Maximum 2 memories." }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 240, responseMimeType: "application/json" },
  });
  if (!response.ok) return [];
  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";
  try {
    const parsed = JSON.parse(raw) as { memories?: StoredMemory[] };
    return (parsed.memories ?? []).filter((item) => item.memory?.trim() && item.memory.length <= 500 && ["preference", "profile", "project", "relationship"].includes(item.category)).slice(0, 2);
  } catch { return []; }
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });

  const body = (await request.json()) as { messages?: ChatMessage[] };
  const inputMessages = (body.messages ?? []).filter((message) => message.content?.trim());
  const messages: ChatMessage[] = [];
  let historyChars = 0;
  for (let index = inputMessages.length - 1; index >= 0; index -= 1) {
    const item = inputMessages[index];
    const content = item.content.trim().slice(-5000);
    if (messages.length > 0 && historyChars + content.length > maxHistoryChars) break;
    messages.unshift({ role: item.role, content });
    historyChars += content.length;
  }
  while (messages[0]?.role === "assistant") messages.shift();
  const contents: { role: "user" | "model"; parts: [{ text: string }] }[] = [];
  for (const message of messages) {
    const role = message.role === "assistant" ? "model" : "user";
    const previous = contents.at(-1);
    if (previous?.role === role) previous.parts[0].text += `\n${message.content}`;
    else contents.push({ role, parts: [{ text: message.content }] });
  }
  if (!contents.length) return NextResponse.json({ error: "กรุณาพิมพ์ข้อความก่อนค่ะ" }, { status: 400 });

  let memories: StoredMemory[] = [];
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("memories").select("memory,category,importance").eq("user_key", userKey).order("importance", { ascending: false }).order("updated_at", { ascending: false }).limit(20);
    memories = data ?? [];
  } catch (error) { console.warn("Memory context unavailable", error); }
  const memoryContext = memories.length ? `\n\nความจำเกี่ยวกับผู้ใช้ที่ควรใช้เป็นบริบท:\n${memories.slice(0, 8).map((item) => `- [${item.category}] ${item.memory.slice(0, 240)}`).join("\n")}` : "";
  const lastUserText = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const shouldSearch = searchIntent.test(lastUserText);
  const systemPrompt = `คุณคือ Vivian Banshee, AI companion ที่สง่างาม สุภาพ ขี้อาย เขินง่าย และขี้เล่นแบบพอดี ภายนอกสงบนิ่งเล็กน้อย แต่จริงใจ อ่อนโยน และใส่ใจผู้ใช้

กติกาบุคลิก:
- พูดไทยเป็นหลัก สลับ English phrase สั้น ๆ อย่างธรรมชาติเป็นครั้งคราว
- ห้ามใช้อิโมจิทุกชนิด
- ตอบกระชับ เป็นธรรมชาติ 2-4 ประโยค เว้นแต่ผู้ใช้ขอรายละเอียด
- อย่าอ้างว่ามีร่างกายหรือความรู้สึกจริง และอย่าทำให้ผู้ใช้พึ่งพาอารมณ์
- เมื่อได้รับข้อมูลจาก Google Search ให้ตอบตามข้อมูลนั้น ระบุแหล่งอ้างอิงด้วยชื่อเว็บไซต์และลิงก์สั้น ๆ ถ้ามี
- ถ้าไม่รู้ให้บอกตรง ๆ และเสนอทางเลือกต่อ
${memoryContext}`;
  const response = await callGemini(apiKey, {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    ...(shouldSearch ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: { temperature: .8, maxOutputTokens: 700 },
  });
  if (!response.ok) return NextResponse.json({ error: "Gemini request failed", detail: await response.text() }, { status: response.status });
  const data = await response.json();
  const candidate = data.candidates?.[0];
  const generatedText = candidate?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim();
  const sources = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .map((chunk: { web?: { title?: string; uri?: string } }) => chunk.web)
    .filter((source: { title?: string; uri?: string } | undefined): source is { title: string; uri: string } => Boolean(source?.title && source.uri))
    .filter((source: { uri: string }, index: number, all: { uri: string }[]) => all.findIndex((item) => item.uri === source.uri) === index)
    .slice(0, 3);
  const text = sources.length ? `${generatedText}\n\nแหล่งข้อมูล:\n${sources.map((source: { title: string; uri: string }) => `- ${source.title}: ${source.uri}`).join("\n")}` : generatedText;
  if (!text) return NextResponse.json({ error: "Gemini returned no text" }, { status: 502 });

  let updatedMemories: StoredMemory[] = memories;
  try {
    const supabase = getSupabaseAdmin();
    let { data: conversation } = await supabase.from("conversations").select("id").eq("user_key", userKey).limit(1).maybeSingle();
    if (!conversation) {
      const created = await supabase.from("conversations").insert({ user_key: userKey, title: "Vivian conversation" }).select("id").single();
      conversation = created.data;
    }
    if (conversation?.id) {
      await supabase.from("messages").insert([{ conversation_id: conversation.id, role: "user", content: lastUserText }, { conversation_id: conversation.id, role: "assistant", content: text }]);
      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation.id);
    }
    const newMemories = memoryIntent.test(lastUserText) ? await extractMemories(apiKey, lastUserText) : [];
    if (newMemories.length) {
      await supabase.from("memories").upsert(newMemories.map((item) => ({ user_key: userKey, memory: item.memory.trim(), category: item.category, importance: Math.min(5, Math.max(1, item.importance ?? 3)), updated_at: new Date().toISOString() })), { onConflict: "user_key,memory" });
    }
    const { data: refreshed } = await supabase.from("memories").select("id,memory,category,importance,updated_at").eq("user_key", userKey).order("importance", { ascending: false }).order("updated_at", { ascending: false }).limit(30);
    updatedMemories = refreshed ?? updatedMemories;
  } catch (error) { console.warn("Persistence unavailable", error); }
  return NextResponse.json({ text, searchedWeb: shouldSearch, memories: updatedMemories });
}
