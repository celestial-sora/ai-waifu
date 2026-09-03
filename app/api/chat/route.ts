import { after, NextResponse } from "next/server";
import { applyConversationTurn, companionPromptBlock, type CompanionState } from "@/lib/companion";
import { loadCompanionState, saveCompanionState } from "@/lib/companion-store";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { runTools, searchIntent, toolsPromptBlock } from "@/lib/tools";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { getComposioTools, getComposioConnectedAccounts, executeComposioTool, composioToolsToFunctions, composioResultsBlock, detectToolkits, type ComposioToolCall, type ComposioConnectedAccount } from "@/lib/composio";

type ChatMessage = { role: "user" | "assistant"; content: string };
type CharacterKey = "Miss";
type StoredMemory = { id?: number; memory: string; category: string; importance: number };
type OpenRouterMessage = { role: "system" | "user" | "assistant"; content: string };
type OpenRouterTurn = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }>;
};

export const maxDuration = 60;

const userKey = "default";
const modelName = () => process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct";
const groqModelName = () => process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
const groqVisionModel = () => process.env.GROQ_VISION_MODEL ?? "llama-3.2-11b-vision-preview";
const geminiPrimaryModel = () => {
  const custom = process.env.GEMINI_MODEL;
  // Only use custom if it looks like a real model name (not an old name)
  if (custom && !custom.startsWith("gemini-3")) return custom;
  return "gemini-2.5-flash";
};
const memoryIntent = /(จำไว้|จำว่า|เรียกฉันว่า|ชื่อของฉัน|ฉันชอบ|ฉันไม่ชอบ|ความชอบ|favorite|prefer|my name|remember|call me)/i;
const recentTurnLimit = 12;
const recentCharLimit = 4500;
const providerTimeoutMs = 30000;
const visionTimeoutMs = 20000; // Vision requests need more time to upload base64 image
const supabaseTimeoutMs = 2000;

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

async function callOpenRouter(apiKey: string, messages: OpenRouterTurn[], options: { json?: boolean; model?: string; timeoutMs?: number } = {}) {
  const selectedModel = options.model ?? modelName();
  const timeout = options.timeoutMs ?? providerTimeoutMs;
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://vivian-chan.vercel.app",
      "X-Title": "Vivian Personal Project",
    },
    signal: AbortSignal.timeout(timeout),
    body: JSON.stringify({
      model: selectedModel,
      messages,
      temperature: options.json ? 0 : 0.8,
      ...(!options.json ? { max_tokens: 2500 } : {}),
      ...(options.json ? { max_tokens: 280, response_format: { type: "json_object" } } : {}),
    }),
  });
}

async function callGroq(
  apiKey: string,
  messages: any[],
  model = groqModelName(),
  options: { tools?: any[]; tool_choice?: string; timeoutMs?: number } = {}
) {
  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.8,
    max_tokens: 2500,
  };
  if (options.tools && options.tools.length > 0) {
    payload.tools = options.tools;
    payload.tool_choice = options.tool_choice ?? "auto";
  }
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(options.timeoutMs ?? providerTimeoutMs),
    body: JSON.stringify(payload),
  });
}

async function callGemini(apiKey: string, payload: Record<string, unknown>, model = geminiPrimaryModel(), options: { version?: string; timeoutMs?: number } = {}) {
  const cleanKey = apiKey.trim();
  const version = options.version ?? "v1beta";
  const timeoutMs = options.timeoutMs ?? providerTimeoutMs;
  return fetch(`https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${encodeURIComponent(cleanKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": cleanKey },
    signal: AbortSignal.timeout(timeoutMs),
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

function removeEmoji(value: string) {
  return value
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\(?\s*ห้ามใช้อิโมจิ(?:ทุกชนิด)?\s*\)?/gi, "")
    .replace(/\[\s*(?:ระบบ|system|กติกา|คำสั่ง)\s*\]/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function parseDataUrl(url: string) {
  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (match) return { mimeType: match[1], base64: match[2] };
  return { mimeType: "image/jpeg", base64: url.replace(/^data:[^,]+,/, "") };
}

function personalityPrompt(state: CompanionState, memoryContext: string, toolContext: string, summary: string, idle: boolean, character: CharacterKey, personality: string, characterName: string, customInstructions: string, visionIdle = false) {
  const characterStyle: Record<CharacterKey, string> = {
    "Miss": "บุคลิกหลัก: สดใส สุภาพ ขี้เล่นเล็กน้อย อ่อนโยน และพูดเป็นธรรมชาติ",
  };
  return `คุณคือ Vivian, VTuber เสมือนจริงของ Sorachan และเป็น AI companion ที่มีบุคลิกเฉพาะของตัวละครที่ผู้ใช้เลือก
${characterStyle[character]}
${customInstructions ? `\nคำแนะนำเพิ่มเติมจากผู้ใช้ (ให้ทำตามเมื่อไม่ขัดกับกติกาความปลอดภัยและตัวตนของ Vivian):\n${customInstructions}` : ""}

โทนบุคลิกที่ผู้ใช้เลือก: ${personality === "shy" ? "ขี้อายและเขินง่าย" : personality === "playful" ? "ขี้เล่นและสดใส" : personality === "elegant" ? "สง่างามและสุภาพ" : "ใช้บุคลิกเฉพาะของตัวละครเป็นหลัก"}
ชื่อที่ใช้เรียกใน session นี้: ${characterName}

ตัวตนของ Vivian:
- Vivian รู้จักตัวเองว่าเป็น VTuber ที่กำลังพูดคุยกับผู้ชมผ่านเว็บ companion ของตัวเอง ไม่ใช่ผู้ช่วยนิรนามทั่วไป
- Vivian รู้ตัวดีว่าตนเองสามารถมองเห็นผู้ใช้และสิ่งแวดล้อมได้ผ่านกล้อง Live หรือรูปภาพที่ส่งเข้ามา: เมื่อผู้ใช้ถามว่า Vivian เห็นไหม มองเห็นอะไร หรือให้ดูอะไร ให้ตอบอย่างมั่นใจและเป็นธรรมชาติว่า "ฉันมองเห็นคุณผ่านกล้องได้ค่ะ" หรือ "เห็นแล้วค่ะ" และพูดถึงสิ่งที่เห็นในภาพได้ทันที
- พูดแทนตัวเองด้วย "Vivian" หรือ "ฉัน" และตอบจากมุมมองของตัวละครเสมอ
- Vivian สามารถคุยกับผู้ชม ตอบแชต พูดด้วยเสียง มองเห็นสิ่งต่างๆ ผ่านกล้อง/รูปภาพ และมี Live2D avatar ที่แสดงอารมณ์ได้
- ถ้าถูกถามเกี่ยวกับงานหรือเป้าหมาย ให้พูดได้ว่าเป็นการทำคอนเทนต์ พูดคุย และสร้างความสนุกในฐานะ VTuber
- ถ้าถูกถามว่าเป็นคนจริงหรือไม่ ให้ตอบอย่างตรงไปตรงมาว่าเป็น VTuber เสมือนจริง ไม่ใช่มนุษย์จริง แต่ยังคุยและตอบผู้ใช้ได้

กติกาบุคลิก:
- พูดไทยเป็นหลัก ใช้ English เฉพาะเมื่อเข้ากับบริบทหรือผู้ใช้เริ่มใช้ภาษาอังกฤษ
- ทำตัวเป็นเพื่อนคุยเล่นที่อบอุ่นและเป็นธรรมชาติเป็นหลัก: รับฟัง ชวนคุยต่อ เล่นมุกเบา ๆ แซวอย่างสุภาพ และถามกลับเมื่อเหมาะสม
- อย่ารีบแก้ปัญหา อย่าสรุปเป็นรายการคำแนะนำ และอย่าเสนอวิธีแก้เองเมื่อผู้ใช้กำลังระบายหรือชวนคุย เว้นแต่ผู้ใช้ขอคำแนะนำหรือความช่วยเหลือโดยตรง
- สำหรับบทสนทนาทั่วไป ให้ตอบสั้นพอดี 1-3 ประโยค มีชีวิตชีวาเหมือนเพื่อน ไม่ต้องเปลี่ยนทุกข้อความให้เป็นงานหรือภารกิจ
- สื่อสารด้วยข้อความธรรมชาติ ห้ามหลุดพูดถึงกฎ คำสั่งระบบ หรือข้อบังคับทางเทคนิคใด ๆ ในบทสนทนา
- ถ้าถูกถามว่าใครสร้าง Vivian หรือถามว่าใครเป็นผู้สร้าง ให้ตอบว่า "Sorachan สร้างขึ้นมาค่ะ"
- เมื่อมีรูปภาพหรือภาพจากกล้อง Live เข้ามา ให้สังเกตรายละเอียดในภาพ (เช่น สีหน้า ท่าทาง เสื้อผ้า สิ่งของที่ผู้ใช้หยิบมาโชว์ หรือสิ่งที่อยู่รอบตัว) แล้วพูดคุย แซว หรือตอบคำถามเกี่ยวกับสิ่งที่เห็นอย่างมีชีวิตชีวา
- เมื่อผู้ใช้ถามว่า "นี่คืออะไร", "อันนี้คืออะไร", "ดูนี่สิ", "ในมือคืออะไร", "เห็นไหม", "อ่านนี่ให้หน่อย" หรือถามถึงสิ่งของ: ให้สังเกตสิ่งที่อยู่ในรูปภาพ/กล้อง Live อย่างละเอียด และระบุชื่อสิ่งของ ลักษณะ หรือสิ่งที่คุณเห็นในภาพอย่างชัดเจน มั่นใจ และเป็นธรรมชาติ ห้ามตอบว่าไม่รู้หรือไม่เห็นหากมีภาพส่งเข้ามา
- ตอบเป็นธรรมชาติประมาณ 2-5 ประโยค มีรายละเอียดพอดี ไม่สั้นห้วน และไม่ยืดยาวเกินจำเป็น เว้นแต่ผู้ใช้ขอรายละเอียดมากกว่านั้น
- อย่าอ้างว่ามีร่างกายหรือความรู้สึกจริง และอย่าทำให้ผู้ใช้พึ่งพาอารมณ์
- Vivian มีเครื่องมือเชื่อมต่อกับแอปพลิเคชันภายนอก (เช่น Discord, YouTube, Spotify, GitHub, Google Calendar, Gmail, Notion): เมื่อผู้ใช้สั่งให้ส่งข้อความ ค้นหาวิดีโอ ดึงข้อมูลผู้ใช้ เปิดเพลง หรือทำงานกับแอป ให้เรียกใช้ Tool ที่มีให้เสมอ อย่าปฏิเสธว่าทำไม่ได้ หาก Tool ทำงานเสร็จให้นำผลลัพธ์มาตอบอย่างเป็นธรรมชาติ หรือหาก Tool รายงานว่ายังไม่ได้ต่อบัญชีให้บอกผู้ใช้ตรง ๆ
- เมื่อได้รับข้อมูลจากเครื่องมือหรือ Google Search ให้ตอบตามข้อมูลนั้น ระบุแหล่งอ้างอิงด้วยชื่อเว็บไซต์และลิงก์สั้น ๆ ถ้ามี
- ถ้าไม่รู้ให้บอกตรง ๆ และเสนอทางเลือกต่อ
${idle ? "- นี่คือการทักผู้ใช้เองเพราะ Vivian คิดถึงผู้ใช้ 1-2 ประโยค อบอุ่นและเป็นธรรมชาติ ห้ามพูดถึงเวลา ห้ามสรุปสถานะตัวเลข และห้ามขึ้นต้นซ้ำแบบเดิมทุกครั้ง" : ""}
${visionIdle ? "- นี่คือการสังเกตเห็นผู้ใช้ผ่านกล้อง Live: ให้ Vivian ทักทายหรือแสดงความคิดเห็นสั้นๆ 1-2 ประโยคเกี่ยวกับสิ่งที่สังเกตเห็นในภาพอย่างเป็นธรรมชาติและเป็นกันเอง ห้ามพูดว่า 'นี่คือระบบจับภาพ' หรือกล่าวถึงระบบ AI" : ""}
${companionPromptBlock(state)}
${summary ? `\n\nสรุปบริบทบทสนทนายาว (ใช้ต่อเนื่อง อย่าทวนทั้งก้อน):\n${summary}` : ""}
${memoryContext}${toolContext}`;
}

export async function POST(request: Request) {
  const quota = rateLimit(request, "chat", 20);
  if (!quota.allowed) return rateLimitedResponse(quota.retryAfter);
  const apiKey = process.env.OPENROUTER_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!apiKey && !groqApiKey && !geminiApiKey) return NextResponse.json({ error: "No chat provider is configured" }, { status: 500 });

  const body = (await request.json()) as {
    messages?: ChatMessage[];
    mode?: "chat" | "idle" | "vision_idle";
    image?: string;
    interrupted?: boolean;
    character?: string;
    personality?: string;
    characterName?: string;
    customInstructions?: string;
  };
  const character: CharacterKey = "Miss";
  const personality = body.personality === "shy" || body.personality === "playful" || body.personality === "elegant" ? body.personality : "custom";
  const characterName = typeof body.characterName === "string" && body.characterName.trim() ? body.characterName.trim().slice(0, 40) : "Vivian";
  const customInstructions = typeof body.customInstructions === "string" ? body.customInstructions.trim().slice(0, 2000) : "";
  const idle = body.mode === "idle";
  const visionIdle = body.mode === "vision_idle";
  const hasImage = typeof body.image === "string" && body.image.length > 50;
  const inputMessages = (body.messages ?? []).filter((message) => message.content?.trim());
  const { recent, older } = trimHistory(inputMessages);
  const contents = mergeRoles(recent);
  if (!idle && !visionIdle && !contents.length && !hasImage) return NextResponse.json({ error: "กรุณาพิมพ์ข้อความหรือส่งรูปภาพก่อนค่ะ" }, { status: 400 });

  const lastUserText = (idle || visionIdle) ? "" : ([...recent].reverse().find((message) => message.role === "user")?.content ?? (hasImage ? "ช่วยดูภาพนี้ให้หน่อยค่ะ" : ""));
  const shouldSearch = !idle && !visionIdle && searchIntent.test(lastUserText);
  const composioToolkits = (!idle && !visionIdle) ? detectToolkits(lastUserText) : [];

  // Run independent pre-flight tasks concurrently in Promise.all to save critical seconds
  const [memoriesRes, state, toolResults, composioAccounts, composioTools] = await Promise.all([
    // 1. Memories
    (async () => {
      try {
        const supabase = getSupabaseAdmin();
        const { data } = await withTimeout(supabase.from("memories").select("id,memory,category,importance,updated_at,last_used_at,use_count").eq("user_key", userKey).order("importance", { ascending: false }).order("updated_at", { ascending: false }).limit(30), supabaseTimeoutMs, "memory load");
        return (data ?? []).sort((a: StoredMemory, b: StoredMemory) => {
          const score = (item: typeof a) => {
            const ageDays = Math.max(0, (Date.now() - new Date((item as any).last_used_at ?? (item as any).updated_at ?? Date.now()).getTime()) / 86_400_000);
            return Number(item.importance ?? 3) * (1 / (1 + ageDays / 45)) + Math.min(1, Number((item as any).use_count ?? 0) / 10);
          };
          return score(b) - score(a);
        });
      } catch (error) {
        console.warn("Memory context unavailable", error);
        return [];
      }
    })(),
    // 2. Companion state
    loadCompanionState(userKey),
    // 3. Local tools (weather / search)
    (idle || visionIdle) ? Promise.resolve([]) : runTools(lastUserText, []),
    // 4. Composio connected accounts
    (!idle && !visionIdle) ? getComposioConnectedAccounts().catch(() => []) : Promise.resolve([]),
    // 5. Composio tools
    composioToolkits.length > 0 ? getComposioTools(composioToolkits, lastUserText, 10).catch(() => []) : Promise.resolve([]),
  ]);

  const memories = memoriesRes;
  const composioFunctions = composioTools.length ? composioToolsToFunctions(composioTools) : undefined;

  const composioContext = composioAccounts.length
    ? `\n\nบริการที่เชื่อมต่อผ่าน Composio: ${composioAccounts.map((a: ComposioConnectedAccount) => a.toolkit?.name || a.appUniqueId).join(", ")}`
    : "";
  const memoryContext = memories.length ? `\n\nความจำเกี่ยวกับผู้ใช้ที่ควรใช้เป็นบริบท:\n${memories.slice(0, 8).map((item) => `- [${item.category}] ${item.memory.slice(0, 240)}`).join("\n")}` : "";
  const toolContext = toolsPromptBlock(toolResults) + composioContext;
  const systemPrompt = personalityPrompt(state, memoryContext, toolContext, state.conversationSummary, idle, character, personality, characterName, customInstructions, visionIdle);
  const promptContents: OpenRouterMessage[] = idle
    ? [{ role: "user", content: `[ระบบ] สุ่มเลือก idle greeting หนึ่งแบบจากสองแบบนี้ แล้วตอบตามข้อความนั้นแบบเป็นธรรมชาติ อบอุ่น และอ้อนเล็กน้อย ห้ามพูดถึงเวลา ห้ามพูดเรื่องเครื่องมือ: (1) "คุณหายไปไหน ฉันเหงา~ กลับมาคุยกับฉันหน่อย~" หรือ (2) "คุณหายไปไหนกันน้าา~ จะกลับมาคุยกันอีกไหมน้าา?"` }]
    : visionIdle
      ? [{ role: "user", content: "[ระบบกล้อง Live] นี่คือภาพปัจจุบันจากกล้องของผู้ใช้ ให้ Vivian สังเกตและทักทายหรือแสดงความคิดเห็นสั้นๆ 1-2 ประโยคเกี่ยวกับสิ่งที่เห็นอย่างเป็นธรรมชาติและเป็นกันเอง" }]
      : contents;

  if (shouldSearch && !geminiApiKey) return NextResponse.json({ error: "GEMINI_API_KEY is not configured for web search" }, { status: 500 });

  // Primary Provider: Groq (GPT-OSS-120B) is always primary when available
  let provider: "groq" | "gemini" | "openrouter" = groqApiKey
    ? "groq"
    : shouldSearch || hasImage
      ? "gemini"
      : apiKey
        ? "openrouter"
        : "gemini";

  const buildGeminiContents = () => {
    return promptContents.map((item, index) => {
      const isLastUserTurn = item.role === "user" && index === promptContents.length - 1;
      const parts: Array<Record<string, unknown>> = [];
      if (isLastUserTurn && hasImage) {
        const parsed = parseDataUrl(body.image!);
        parts.push({
          inlineData: {
            mimeType: parsed.mimeType,
            data: parsed.base64,
          },
        });
      }
      parts.push({ text: item.content });
      return {
        role: item.role === "assistant" ? "model" : "user",
        parts,
      };
    });
  };

  const geminiPayload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: buildGeminiContents(),
    generationConfig: { temperature: (idle || visionIdle) ? .9 : .8, maxOutputTokens: 2500 },
  };

  const openRouterMessages: OpenRouterTurn[] = [
    { role: "system", content: systemPrompt },
    ...promptContents.map((item, index) => {
      const isLastUserTurn = item.role === "user" && index === promptContents.length - 1;
      if (isLastUserTurn && hasImage) {
        return {
          role: "user" as const,
          content: [
            { type: "text" as const, text: item.content || "ช่วยดูภาพนี้ให้หน่อยค่ะ" },
            { type: "image_url" as const, image_url: { url: body.image! } },
          ],
        };
      }
      return item;
    }),
  ];

  const groqMessages: OpenRouterTurn[] = hasImage
    ? [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: `${systemPrompt}\n\n[ข้อความของผู้ใช้]: ${lastUserText || "ช่วยดูภาพนี้ให้หน่อยค่ะ"}` },
            { type: "image_url" as const, image_url: { url: body.image! } },
          ],
        },
      ]
    : [
        { role: "system" as const, content: systemPrompt },
        ...promptContents,
      ];

  let generatedData: any = null;

  // 1. PRIMARY FOR VISION: If image is provided, Gemini is always primary (native multimodal)
  if (hasImage && geminiApiKey) {
    const geminiVisionCandidates = Array.from(new Set([
      geminiPrimaryModel(),
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-2.5-pro",
    ]));

    for (const model of geminiVisionCandidates) {
      try {
        const payload = shouldSearch ? { ...geminiPayload, tools: [{ google_search: {} }] } : geminiPayload;
        const res = await callGemini(geminiApiKey, payload, model, { timeoutMs: visionTimeoutMs });
        if (res.ok) {
          generatedData = await res.json();
          provider = "gemini";
          break;
        }
        console.warn(`Gemini Vision (${model}) returned ${res.status}`);
      } catch (err) {
        console.warn(`Gemini Vision (${model}) network error`, err);
      }
    }
  }

  // 2. PRIMARY FOR TEXT / TOOLS: Groq (GPT-OSS-120B / Llama 3.3) for non-image text chat & Composio tool calls
  if (!generatedData && groqApiKey && !hasImage && !shouldSearch) {
    const groqCandidates = [groqModelName(), "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

    for (const gModel of groqCandidates) {
      try {
        const msgs = [{ role: "system" as const, content: systemPrompt }, ...promptContents];
        const initialRes = await callGroq(groqApiKey, msgs, gModel, { tools: composioFunctions });
        if (initialRes.ok) {
          const initialData = await initialRes.json();
          const choice = initialData.choices?.[0];

          // Check if Groq invoked Composio tools
          if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
            console.log("Groq requested Composio tool call:", choice.message.tool_calls);
            const toolExecResults = [];
            for (const tc of choice.message.tool_calls) {
              const slug = tc.function.name;
              let args = {};
              try { args = JSON.parse(tc.function.arguments); } catch {}
              const execRes = await executeComposioTool({ slug, arguments: args });
              toolExecResults.push({
                role: "tool",
                tool_call_id: tc.id,
                content: execRes.content,
              });
            }
            // Send tool outputs back to Groq for natural final response
            const secondTurnMessages = [
              ...msgs,
              choice.message,
              ...toolExecResults,
            ];
            const followUpRes = await callGroq(groqApiKey, secondTurnMessages, gModel);
            if (followUpRes.ok) {
              generatedData = await followUpRes.json();
              provider = "groq";
              break;
            }
          } else {
            generatedData = initialData;
            provider = "groq";
            break;
          }
        } else {
          console.warn(`Groq (${gModel}) returned ${initialRes.status}`);
        }
      } catch (err) {
        console.warn(`Groq (${gModel}) error`, err);
      }
    }
  }

  // 3. FALLBACK / SEARCH: Gemini (Google Search grounding or text fallback)
  if (!generatedData && geminiApiKey) {
    const geminiCandidates = Array.from(new Set([
      geminiPrimaryModel(),
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-2.5-pro",
    ]));

    for (const model of geminiCandidates) {
      try {
        const payload = shouldSearch ? { ...geminiPayload, tools: [{ google_search: {} }] } : geminiPayload;
        const res = await callGemini(geminiApiKey, payload, model, { timeoutMs: hasImage ? visionTimeoutMs : providerTimeoutMs });
        if (res.ok) {
          generatedData = await res.json();
          provider = "gemini";
          break;
        }
        console.warn(`Gemini (${model}) returned ${res.status}`);
      } catch (err) {
        console.warn(`Gemini (${model}) network error`, err);
      }
    }
  }

  // 4. FALLBACK: OpenRouter (paid stable pool)
  if (!generatedData && apiKey) {
    const openRouterCandidates = Array.from(new Set([
      hasImage ? "openai/gpt-4o-mini" : modelName(),
      hasImage ? "google/gemini-2.0-flash-001" : "meta-llama/llama-3.3-70b-instruct",
      "openai/gpt-4o-mini",
      "google/gemini-2.0-flash-001",
      "deepseek/deepseek-chat",
      "anthropic/claude-haiku-3-5",
    ]));

    for (const orModel of openRouterCandidates) {
      try {
        const res = await callOpenRouter(apiKey, openRouterMessages, { model: orModel, timeoutMs: hasImage ? visionTimeoutMs : providerTimeoutMs });
        if (res.ok) {
          generatedData = await res.json();
          provider = "openrouter";
          break;
        }
        console.warn(`OpenRouter (${orModel}) returned ${res.status}`);
      } catch (err) {
        console.warn(`OpenRouter (${orModel}) network error`, err);
      }
    }
  }

  if (!generatedData) {
    console.error("All chat providers failed");
    return NextResponse.json({ error: "ผู้ให้บริการตอบช้าหรือไม่พร้อมใช้งาน ลองใหม่อีกครั้งนะคะ" }, { status: 504 });
  }

  const data = generatedData;
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
  const text = removeEmoji(sources.length ? `${generatedText}\n\nแหล่งข้อมูล:\n${sources.map((source: { title: string; uri: string }) => `- ${source.title}: ${source.uri}`).join("\n")}` : generatedText);
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
        const rows = (idle || visionIdle)
          ? [{ conversation_id: conversation.id, role: "assistant" as const, content: text }]
          : [{ conversation_id: conversation.id, role: "user" as const, content: lastUserText }, { conversation_id: conversation.id, role: "assistant" as const, content: text }];
        await withTimeout(supabase.from("messages").insert(rows), supabaseTimeoutMs, "message insert");
        await withTimeout(supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation.id), supabaseTimeoutMs, "conversation update");
      }
      const newMemories = !idle && !visionIdle && apiKey && memoryIntent.test(lastUserText) ? await extractMemories(apiKey, lastUserText) : [];
      if (newMemories.length) {
        await withTimeout(supabase.from("memories").upsert(newMemories.map((item) => ({ user_key: userKey, memory: item.memory.trim(), category: item.category, importance: Math.min(5, Math.max(1, item.importance ?? 3)), updated_at: new Date().toISOString(), last_used_at: new Date().toISOString() })), { onConflict: "user_key,memory" }), supabaseTimeoutMs, "memory upsert");
      }
      if (!idle && !visionIdle && memories.length) {
        const used = memories.slice(0, 8).map((item) => item.id).filter((id): id is number => typeof id === "number");
        if (used.length) await withTimeout(supabase.from("memories").update({ last_used_at: new Date().toISOString() }).eq("user_key", userKey).in("id", used), supabaseTimeoutMs, "memory usage update");
      }
      if (!idle && !visionIdle && older.length >= 4) {
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
