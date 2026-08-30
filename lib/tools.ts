export type ToolName = "web_search" | "time" | "weather" | "calculator" | "memory_retrieval";
export type ToolResult = { name: ToolName; ok: boolean; content: string };

const weatherIntent = /อากาศ|ฝน|อุณหภูมิ|พยากรณ์|ร้อน|หนาว|weather|forecast|temperature/i;
const timeIntent = /กี่โมง|ตอนนี้เวลา|วันที่เท่าไหร่|วันอะไร|what time|date today|timezone/i;
const calcIntent = /คำนวณ|เท่ากับเท่าไหร่|calculate|เท่าไหร่\s*[0-9]|[0-9]+\s*[\+\-\*x×÷\/]/i;
const memoryIntent = /จำได้ไหม|เคยบอก|ที่เล่าไว้|recall|what did I tell|remember when/i;
export const searchIntent = /(ค้นหา|search|หาให้หน่อย|ข่าว|ล่าสุด|วันนี้|ราคา|current|latest|look up|ออนไลน์|บนเว็บ|ในเน็ต)/i;

const weatherCodes: Record<number, string> = {
  0: "ท้องฟ้าโปร่ง",
  1: "ส่วนมากโปร่ง",
  2: "มีเมฆบางส่วน",
  3: "เมฆมาก",
  45: "หมอก",
  48: "หมอกน้ำแข็ง",
  51: "ฝนปรอยเล็กน้อย",
  61: "ฝนเล็กน้อย",
  63: "ฝนปานกลาง",
  65: "ฝนหนัก",
  71: "หิมะเล็กน้อย",
  80: "ฝนซู่",
  95: "พายุฝนฟ้าคะนอง",
};

export function detectTools(userText: string): ToolName[] {
  const tools: ToolName[] = [];
  if (searchIntent.test(userText)) tools.push("web_search");
  if (timeIntent.test(userText)) tools.push("time");
  if (weatherIntent.test(userText)) tools.push("weather");
  if (calcIntent.test(userText)) tools.push("calculator");
  if (memoryIntent.test(userText)) tools.push("memory_retrieval");
  return tools;
}

export function timeTool(): ToolResult {
  const now = new Date();
  const date = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  const time = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  return { name: "time", ok: true, content: `เขตเวลา Asia/Bangkok: ${date} เวลา ${time} น.` };
}

function extractCity(userText: string) {
  const named = userText.match(/(?:อากาศ|ฝน|weather|forecast).{0,12}(?:ที่|ใน|ที่เมือง|ที่จังหวัด)?\s*([A-Za-zก-๙]{2,30})/i);
  const city = named?.[1]?.trim();
  if (!city || /วันนี้|ตอนนี้|เป็นไง|ไหม|ยังไง|here|now/i.test(city)) return "Bangkok";
  return city;
}

export async function weatherTool(userText: string): Promise<ToolResult> {
  try {
    const city = extractCity(userText);
    const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=th`, { signal: AbortSignal.timeout(4000) });
    const geoData = await geo.json() as { results?: { name: string; latitude: number; longitude: number; country?: string }[] };
    const place = geoData.results?.[0] ?? { name: "Bangkok", latitude: 13.7563, longitude: 100.5018, country: "Thailand" };
    const weather = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FBangkok`, { signal: AbortSignal.timeout(4000) });
    if (!weather.ok) throw new Error("weather failed");
    const data = await weather.json() as { current?: { temperature_2m?: number; relative_humidity_2m?: number; weather_code?: number } };
    const current = data.current ?? {};
    const condition = weatherCodes[current.weather_code ?? 1] ?? "ไม่ระบุ";
    return { name: "weather", ok: true, content: `${place.name}${place.country ? `, ${place.country}` : ""}: ${current.temperature_2m ?? "?"} C, ความชื้น ${current.relative_humidity_2m ?? "?"}%, ${condition}` };
  } catch (error) {
    console.warn("Weather tool failed", error);
    return { name: "weather", ok: false, content: "โหลดข้อมูลอากาศไม่สำเร็จ ใช้ความรู้ทั่วไปอย่างระวัง" };
  }
}

function extractExpression(userText: string) {
  const match = userText.replace(/x/gi, "*").replace(/×/g, "*").replace(/÷/g, "/").match(/[\d.+\-*/() ]{3,}/);
  return match?.[0]?.trim() ?? "";
}

export function calculatorTool(userText: string): ToolResult {
  const expression = extractExpression(userText);
  if (!expression || !/^[\d.+\-*/() ]+$/.test(expression)) return { name: "calculator", ok: false, content: "ไม่มีนิพจน์ที่คำนวณได้" };
  try {
    const value = Function(`"use strict"; return (${expression})`)();
    if (typeof value !== "number" || !Number.isFinite(value)) return { name: "calculator", ok: false, content: "ผลลัพธ์ไม่ใช่ตัวเลข" };
    return { name: "calculator", ok: true, content: `${expression.trim()} = ${Number(value.toPrecision(12))}` };
  } catch {
    return { name: "calculator", ok: false, content: "คำนวณไม่สำเร็จ" };
  }
}

export function memoryTool(userText: string, memories: { memory: string; category: string }[]): ToolResult {
  const terms = userText.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length >= 2).slice(0, 8);
  const hits = memories.filter((item) => terms.some((term) => item.memory.toLowerCase().includes(term))).slice(0, 5);
  if (!hits.length) return { name: "memory_retrieval", ok: true, content: "ไม่พบความจำที่ตรงกับคำถามนี้" };
  return { name: "memory_retrieval", ok: true, content: hits.map((item) => `[${item.category}] ${item.memory}`).join("\n") };
}

export async function runTools(userText: string, memories: { memory: string; category: string }[]): Promise<ToolResult[]> {
  const names = detectTools(userText);
  const results: ToolResult[] = [];
  for (const name of names) {
    if (name === "time") results.push(timeTool());
    if (name === "weather") results.push(await weatherTool(userText));
    if (name === "calculator") results.push(calculatorTool(userText));
    if (name === "memory_retrieval") results.push(memoryTool(userText, memories));
  }
  return results;
}

export function toolsPromptBlock(results: ToolResult[]) {
  if (!results.length) return "";
  return `\n\nผลการใช้เครื่องมือ (ใช้ตอบให้ถูกต้อง อย่าแต่งตัวเลขใหม่ถ้ามีในนี้):\n${results.map((item) => `- ${item.name}: ${item.content}`).join("\n")}`;
}
