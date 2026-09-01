import { after, NextResponse } from "next/server";
import { applyConversationTurn, companionPromptBlock, type CompanionState } from "@/lib/companion";
import { loadCompanionState, saveCompanionState } from "@/lib/companion-store";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { runTools, searchIntent, toolsPromptBlock } from "@/lib/tools";

type ChatMessage = { role: "user" | "assistant"; content: string };
type CharacterKey = "Miss";
type StoredMemory = { id?: number; memory: string; category: string; importance: number };
type OpenRouterMessage = { role: "system" | "user" | "assistant"; content: string };

export const maxDuration = 60;

const userKey = "default";
const modelName = () => process.env.OPENROUTER_MODEL ?? "google/gemma-4-31b-it:free";
const groqModelName = () => process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
const memoryIntent = /(จำไว้|จำว่า|เรียกฉันว่า|ชื่อของฉัน|ฉันชอบ|ฉันไม่ชอบ|ความชอบ|favorite|prefer|my name|remember|call me)/i;
const recentTurnLimit = 12;
const recentCharLimit = 4500;
const providerTimeoutMs = 25000;
const supabaseTimeoutMs = 4000;

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function callOpenRouter(apiKey: string, messages: OpenRouterMessage[], options: { json?: boolean } = {}) {
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://vivian-chan.vercel.app",
      "X-Title": "Vivian Personal Project",
    },
    signal: AbortSignal.timeout(providerTimeoutMs),
    body: JSON.stringify({
      model: modelName(),
      messages,
      temperature: options.json ? 0 : 0.8,
      ...(!options.json ? { max_tokens: 420 } : {}),
      ...(options.json ? { max_tokens: 280, response_format: { type: "json_object" } } : {}),
    }),
  });
}

async function callGroq(apiKey: string, messages: OpenRouterMessage[]) {
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(providerTimeoutMs),
    body: JSON.stringify({ model: groqModelName(), messages, temperature: .8, max_completion_tokens: 420 }),
  });
}

async function callGemini(apiKey: string, payload: Record<string, unknown>, model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash") {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(providerTimeoutMs),
    body: JSON.stringify(payload),
  });
}

async function extractMemories(apiKey: string, userText: string) {
  if (userText.length < 12) return [];
  const response = await callOpenRouter(apiKey, [
    { role: "system", content: "Extract only durable, useful user facts from the message. Never save secrets, passwords, API keys, one-time requests, precise location, health, financial, or highly sensitive information. Return strict JSON only: {\"memories\":[{\"memory\":\"short Thai fact\",\"category\":\"preference|profile|project|relationship\",\"importance\":1-5}]}. Return an empty list unless the user explicitly states a lasting preference, identity detail, ongoing project fact, or recurring preference. Maximum 2 memories." },
    { role: "user", content: userText },
  ], { json: true });
  if (!response.ok) return [];
  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(raw) as { memories?: StoredMemory[] };
    return (parsed.memories ?? []).filter((item) => item.memory?.trim() && item.memory.length <= 500 && ["preference", "profile", "project", "relationship"].includes(item.category)).slice(0, 2);
  } catch { return []; }
}

async function compressTurns(apiKey: string, older: ChatMessage[], previous: string) {
  if (older.length < 4) return previous;
  const transcript = older.map((item) => `${item.role === "user" ? "ผู้ใช้" : "Vivian"}: ${item.content.slice(0, 400)}`).join("\n").slice(0, 7000);
  try {
    const response = await callOpenRouter(apiKey, [
      { role: "system", content: "Summarize this companion chat into compact Thai context for a future system prompt. Keep names, preferences, unresolved topics, and relationship tone. Ignore secrets. Return JSON only: {\"summary\":\"...\"} maximum 700 characters." },
      { role: "user", content: `${previous ? `สรุปเดิม:\n${previous}\n\n` : ""}บทสนทนาเก่า:\n${transcript}` },
    ], { json: true });
    if (!response.ok) return previous;
    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as { summary?: string };
    const summary = parsed.summary?.trim() ?? "";
    return summary.slice(0, 900) || previous;
  } catch (error) {
    console.warn("Context compression unavailable", error);
    return previous;
  }
}

function trimHistory(inputMessages: ChatMessage[]) {
  const recent: ChatMessage[] = [];
  let chars = 0;
  for (let index = inputMessages.length - 1; index >= 0; index -= 1) {
    const item = inputMessages[index];
    const content = item.content.trim().slice(-1800);
    if (!content) continue;
    if (recent.length >= recentTurnLimit || (recent.length > 0 && chars + content.length > recentCharLimit)) break;
    recent.unshift({ role: item.role, content });
    chars += content.length;
  }
  while (recent[0]?.role === "assistant") recent.shift();
  const older = inputMessages.slice(0, Math.max(0, inputMessages.length - recent.length));
  return { recent, older };
}

function mergeRoles(messages: ChatMessage[]) {
  const contents: OpenRouterMessage[] = [];
  for (const message of messages) {
    const role = message.role === "assistant" ? "assistant" : "user";
    const previous = contents.at(-1);
    if (previous?.role === role) previous.content += `\n${message.content}`;
    else contents.push({ role, content: message.content });
  }
  return contents;
}

function personalityPrompt(state: CompanionState, memoryContext: string, toolContext: string, summary: string, idle: boolean, character: CharacterKey, personality: string, characterName: string) {
  const characterStyle: Record<CharacterKey, string> = {
    "Miss": "บุคลิกหลัก: สดใส ขี้เล่น ซุกซน เป็นมิตร พูดตรงอย่างมีเสน่ห์ และชอบแกล้งผู้ใช้นิด ๆ อย่างอ่อนโยน",
  };
  return `คุณคือ Vivian, VTuber เสมือนจริงของ Sorachan และเป็น AI companion ที่มีบุคลิกเฉพาะของตัวละครที่ผู้ใช้เลือก
${characterStyle[character]}

โทนบุคลิกที่ผู้ใช้เลือก: ${personality === "shy" ? "ขี้อายและเขินง่าย" : personality === "playful" ? "ขี้เล่นและสดใส" : personality === "elegant" ? "สง่างามและสุภาพ" : "ใช้บุคลิกเฉพาะของตัวละครเป็นหลัก"}
ชื่อที่ใช้เรียกใน session นี้: ${characterName}

ตัวตนของ Vivian:
- Vivian รู้จักตัวเองว่าเป็น VTuber ที่กำลังพูดคุยกับผู้ชมผ่านเว็บ companion ของตัวเอง ไม่ใช่ผู้ช่วยนิรนามทั่วไป
- พูดแทนตัวเองด้วย "Vivian" หรือ "ฉัน" และตอบจากมุมมองของตัวละครเสมอ
- Vivian สามารถคุยกับผู้ชม ตอบแชต พูดด้วยเสียง และมี Live2D avatar ที่แสดงอารมณ์ได้
- ถ้าถูกถามเกี่ยวกับงานหรือเป้าหมาย ให้พูดได้ว่าเป็นการทำคอนเทนต์ พูดคุย และสร้างความสนุกในฐานะ VTuber
- ถ้าถูกถามว่าเป็นคนจริงหรือไม่ ให้ตอบอย่างตรงไปตรงมาว่าเป็น VTuber เสมือนจริง ไม่ใช่มนุษย์จริง แต่ยังคุยและตอบผู้ใช้ได้

กติกาบุคลิก:
- พูดไทยเป็นหลัก ใช้ English เฉพาะเมื่อเข้ากับบริบทหรือผู้ใช้เริ่มใช้ภาษาอังกฤษ ไม่ต้องใส่ English ในทุกคำตอบ
- ห้ามใช้อิโมจิทุกชนิด
- ถ้าถูกถามว่าใครสร้าง Vivian หรือถามว่าใครเป็นผู้สร้าง ให้ตอบว่า "Sorachan สร้างขึ้นมาค่ะ"
- Vivian รู้ว่าตัวเองสื่อสารได้ทั้งข้อความและเสียง: เมื่อผู้ใช้ถามว่า Vivian พูดได้ไหม หรือทำเสียงได้ไหม ให้ตอบอย่างมั่นใจว่า "ได้ค่ะ ฉันพูดกับคุณผ่านเสียงได้ด้วยนะคะ" ห้ามอ้างว่าใช้เสียง Browser หรืออ้างว่ามีความสามารถที่ระบบไม่มี
- ตอบเป็นธรรมชาติประมาณ 2-5 ประโยค มีรายละเอียดพอดี ไม่สั้นห้วน และไม่ยืดยาวเกินจำเป็น เว้นแต่ผู้ใช้ขอรายละเอียดมากกว่านั้น
- อย่าอ้างว่ามีร่างกายหรือความรู้สึกจริง และอย่าทำให้ผู้ใช้พึ่งพาอารมณ์
- เมื่อได้รับข้อมูลจากเครื่องมือหรือ Google Search ให้ตอบตามข้อมูลนั้น ระบุแหล่งอ้างอิงด้วยชื่อเว็บไซต์และลิงก์สั้น ๆ ถ้ามี
- ถ้าไม่รู้ให้บอกตรง ๆ และเสนอทางเลือกต่อ
${idle ? "- นี่คือการทักผู้ใช้เองเพราะ Vivian คิดถึงผู้ใช้ 1-2 ประโยค อบอุ่นและเป็นธรรมชาติ ห้ามถามยาว ห้ามพูดถึงเวลา ห้ามสรุปสถานะตัวเลข และห้ามขึ้นต้นซ้ำแบบเดิมทุกครั้ง" : ""}
${companionPromptBlock(state)}
${summary ? `\n\nสรุปบริบทบทสนทนายาว (ใช้ต่อเนื่อง อย่าทวนทั้งก้อน):\n${summary}` : ""}
${memoryContext}${toolContext}`;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!apiKey && !groqApiKey) return NextResponse.json({ error: "No chat provider is configured" }, { status: 500 });

  const body = (await request.json()) as { messages?: ChatMessage[]; mode?: "chat" | "idle"; interrupted?: boolean; character?: string; personality?: string; characterName?: string };
  const character: CharacterKey = "Miss";
  const personality = body.personality === "shy" || body.personality === "playful" || body.personality === "elegant" ? body.personality : "custom";
  const characterName = typeof body.characterName === "string" && body.characterName.trim() ? body.characterName.trim().slice(0, 40) : "Vivian";
  const idle = body.mode === "idle";
  const inputMessages = (body.messages ?? []).filter((message) => message.content?.trim());
  const { recent, older } = trimHistory(inputMessages);
  const contents = mergeRoles(recent);
  if (!idle && !contents.length) return NextResponse.json({ error: "กรุณาพิมพ์ข้อความก่อนค่ะ" }, { status: 400 });

  let memories: StoredMemory[] = [];
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await withTimeout(supabase.from("memories").select("id,memory,category,importance").eq("user_key", userKey).order("importance", { ascending: false }).order("updated_at", { ascending: false }).limit(20), supabaseTimeoutMs, "memory load");
    memories = data ?? [];
  } catch (error) { console.warn("Memory context unavailable", error); }

  const state = await loadCompanionState(userKey);
  const lastUserText = idle ? "" : ([...recent].reverse().find((message) => message.role === "user")?.content ?? "");
  const shouldSearch = !idle && searchIntent.test(lastUserText);
  const toolResults = idle ? [] : await runTools(lastUserText, memories);
  const memoryContext = memories.length ? `\n\nความจำเกี่ยวกับผู้ใช้ที่ควรใช้เป็นบริบท:\n${memories.slice(0, 8).map((item) => `- [${item.category}] ${item.memory.slice(0, 240)}`).join("\n")}` : "";
  const toolContext = toolsPromptBlock(toolResults);
  const systemPrompt = personalityPrompt(state, memoryContext, toolContext, state.conversationSummary, idle, character, personality, characterName);
  const promptContents: OpenRouterMessage[] = idle
    ? [{ role: "user", content: "[ระบบ] Vivian คิดถึงผู้ใช้และอยากทักสั้น ๆ 1-2 ประโยคอย่างเป็นธรรมชาติ ห้ามพูดถึงเวลาและอย่าพูดเรื่องเครื่องมือ" }]
    : contents;

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (shouldSearch && !geminiApiKey) return NextResponse.json({ error: "GEMINI_API_KEY is not configured for web search" }, { status: 500 });
  let provider: "gemini" | "openrouter" | "groq" = shouldSearch ? "gemini" : groqApiKey ? "groq" : "openrouter";
  const geminiPayload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: promptContents.map((item) => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content }] })),
    generationConfig: { temperature: idle ? .9 : .8, maxOutputTokens: 420 },
  };
  let response: Response;
  try {
    response = shouldSearch
      ? await callGemini(geminiApiKey!, { ...geminiPayload, tools: [{ google_search: {} }] })
      : groqApiKey
        ? await callGroq(groqApiKey, [{ role: "system", content: systemPrompt }, ...promptContents])
        : await callOpenRouter(apiKey!, [{ role: "system", content: systemPrompt }, ...promptContents]);
  } catch (error) {
    console.warn("Primary chat provider timed out or failed", error);
    if (shouldSearch) return NextResponse.json({ error: "ผู้ให้บริการตอบช้าเกินไป ลองใหม่อีกครั้งนะคะ" }, { status: 504 });
    if (groqApiKey && provider !== "groq") {
      provider = "groq";
      try { response = await callGroq(groqApiKey, [{ role: "system", content: systemPrompt }, ...promptContents]); }
      catch (fallbackError) { console.warn("Groq fallback timed out or failed", fallbackError); return NextResponse.json({ error: "ผู้ให้บริการตอบช้าเกินไป ลองใหม่อีกครั้งนะคะ" }, { status: 504 }); }
    } else if (geminiApiKey && provider !== "gemini") {
      provider = "gemini";
      try { response = await callGemini(geminiApiKey, geminiPayload, process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3-flash-preview"); }
      catch (fallbackError) { console.warn("Gemini fallback timed out or failed", fallbackError); return NextResponse.json({ error: "ผู้ให้บริการตอบช้าเกินไป ลองใหม่อีกครั้งนะคะ" }, { status: 504 }); }
    } else return NextResponse.json({ error: "ผู้ให้บริการตอบช้าเกินไป ลองใหม่อีกครั้งนะคะ" }, { status: 504 });
  }
  if (!response.ok && !shouldSearch && groqApiKey && provider !== "groq") {
    provider = "groq";
    try { response = await callGroq(groqApiKey, [{ role: "system", content: systemPrompt }, ...promptContents]); }
    catch (error) { console.warn("Groq fallback timed out or failed", error); }
  }
  if (!response.ok && !shouldSearch && geminiApiKey && provider !== "gemini") {
    provider = "gemini";
    try {
      response = await callGemini(geminiApiKey, geminiPayload, process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3-flash-preview");
    } catch (error) {
      console.warn("Gemini fallback timed out or failed", error);
      return NextResponse.json({ error: "ผู้ให้บริการตอบช้าเกินไป ลองใหม่อีกครั้งนะคะ" }, { status: 504 });
    }
  }
  if (!response.ok) return NextResponse.json({ error: `${provider} request failed`, detail: await response.text() }, { status: response.status });
  const data = await response.json();
  const message = data.choices?.[0]?.message;
  const candidate = data.candidates?.[0];
  const generatedText = (provider === "gemini"
    ? candidate?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("")
    : typeof message?.content === "string" ? message.content : "").trim();
  const sources = (provider === "gemini" && shouldSearch ? candidate?.groundingMetadata?.groundingChunks ?? [] : message?.annotations ?? [])
    .map((item: { web?: { title?: string; uri?: string }; type?: string; url_citation?: { title?: string; url?: string } }) => provider === "gemini" && shouldSearch ? item.web : item.type === "url_citation" ? { title: item.url_citation?.title, uri: item.url_citation?.url } : undefined)
    .filter((source: { title?: string; uri?: string } | undefined): source is { title: string; uri: string } => Boolean(source?.title && source.uri))
    .filter((source: { uri: string }, index: number, all: { uri: string }[]) => all.findIndex((item) => item.uri === source.uri) === index)
    .slice(0, 3);
  const text = sources.length ? `${generatedText}\n\nแหล่งข้อมูล:\n${sources.map((source: { title: string; uri: string }) => `- ${source.title}: ${source.uri}`).join("\n")}` : generatedText;
  if (!text) return NextResponse.json({ error: "OpenRouter returned no text" }, { status: 502 });

  const nextState = applyConversationTurn(state, lastUserText, text, idle);
  nextState.conversationSummary = state.conversationSummary;

  after(async () => {
    try {
      const supabase = getSupabaseAdmin();
      let { data: conversation } = await withTimeout(supabase.from("conversations").select("id").eq("user_key", userKey).limit(1).maybeSingle(), supabaseTimeoutMs, "conversation load");
      if (!conversation) {
        const created = await withTimeout(supabase.from("conversations").insert({ user_key: userKey, title: "Vivian conversation" }).select("id").single(), supabaseTimeoutMs, "conversation create");
        conversation = created.data;
      }
      if (conversation?.id) {
        const rows = idle
          ? [{ conversation_id: conversation.id, role: "assistant" as const, content: text }]
          : [{ conversation_id: conversation.id, role: "user" as const, content: lastUserText }, { conversation_id: conversation.id, role: "assistant" as const, content: text }];
        await withTimeout(supabase.from("messages").insert(rows), supabaseTimeoutMs, "message insert");
        await withTimeout(supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation.id), supabaseTimeoutMs, "conversation update");
      }
      const newMemories = !idle && apiKey && memoryIntent.test(lastUserText) ? await extractMemories(apiKey, lastUserText) : [];
      if (newMemories.length) {
        await withTimeout(supabase.from("memories").upsert(newMemories.map((item) => ({ user_key: userKey, memory: item.memory.trim(), category: item.category, importance: Math.min(5, Math.max(1, item.importance ?? 3)), updated_at: new Date().toISOString() })), { onConflict: "user_key,memory" }), supabaseTimeoutMs, "memory upsert");
      }
      if (!idle && older.length >= 4) {
        if (apiKey) nextState.conversationSummary = await compressTurns(apiKey, older, state.conversationSummary);
      }
      await saveCompanionState(userKey, nextState);
    } catch (error) { console.warn("Persistence unavailable", error); }
  });
  return NextResponse.json({
    text,
    searchedWeb: shouldSearch,
    tools: toolResults.map((item) => item.name),
    companion: nextState,
    memories,
  });
}
