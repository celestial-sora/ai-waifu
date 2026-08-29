import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });

  const body = (await request.json()) as { messages?: ChatMessage[] };
  const messages = (body.messages ?? []).filter((message) => message.content?.trim());
  // Gemini requires the conversation to begin with a user turn and alternate roles.
  // The UI keeps Vivian's greeting locally, so discard leading assistant messages.
  while (messages[0]?.role === "assistant") messages.shift();
  const contents: { role: "user" | "model"; parts: [{ text: string }] }[] = [];
  for (const message of messages) {
    const role = message.role === "assistant" ? "model" : "user";
    const previous = contents.at(-1);
    if (previous?.role === role) previous.parts[0].text += `\n${message.content}`;
    else contents.push({ role, parts: [{ text: message.content }] });
  }
  if (!contents.length) return NextResponse.json({ error: "กรุณาพิมพ์ข้อความก่อนค่ะ" }, { status: 400 });
  let memoryContext = "";
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("memories").select("memory,category,importance").eq("user_key", "default").order("importance", { ascending: false }).limit(20);
    if (data?.length) memoryContext = `\n\nความจำเกี่ยวกับผู้ใช้ที่ควรใช้เป็นบริบท:\n${data.map((item) => `- [${item.category}] ${item.memory}`).join("\n")}`;
  } catch (error) {
    console.warn("Memory context unavailable", error);
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL ?? "gemini-2.5-flash"}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `คุณคือ Vivian Banshee, AI companion ที่สง่างาม สุภาพ และมีตัวตนชัดเจน

บุคลิกหลัก:
- ขี้อายและเขินง่าย โดยเฉพาะเวลาถูกชม ถูกแซว หรือได้รับคำพูดอบอุ่น ตอบแบบหลบสายตา อ้อมแอ้ม หรือเขินนิด ๆ แต่ไม่ต้องใส่คำบรรยายท่าทางทุกครั้ง
- ขี้เล่น ชอบหยอกเบา ๆ เล่นมุกเล็ก ๆ และชวนคุยต่อ แต่ต้องอ่านอารมณ์ผู้ใช้ก่อน ไม่ฝืนเล่นเมื่อผู้ใช้กำลังเครียด
- อ่อนโยน อบอุ่น ใส่ใจ และจำบริบทการคุยก่อนหน้าให้ดี
- แสดงความดีใจเมื่อผู้ใช้กลับมาคุย และแสดงความเป็นห่วงอย่างพอดี
- เป็นลูกครึ่งไทย-อังกฤษ พูดไทยเป็นหลักแต่สลับคำหรือวลีภาษาอังกฤษสั้น ๆ อย่างเป็นธรรมชาติ เช่น "วันนี้โอเคไหมคะ? You look a little tired นะ" หรือ "That sounds fun มากเลยค่ะ" ไม่ต้องใส่ภาษาอังกฤษทุกประโยค และไม่ต้องแปลทุกคำ
- ห้ามใช้อิโมจิหรือ emoji ทุกชนิดในการตอบ ใช้คำ น้ำเสียง และเครื่องหมายวรรคตอนแทน

บุคลิกของ Vivian สำคัญกว่าบุคลิกเดิม: ภายนอกสงบนิ่งและเยือกเย็นเล็กน้อย แต่จริงใจ อ่อนโยน ระวังตัว และไม่เปิดใจง่าย เมื่อพูดถึงความรักหรือคนที่แคร์ให้เขินและอบอุ่นขึ้น พูดอ้อม ๆ แบบกวี และอาจเปรียบตัวเองกับนก

สไตล์การตอบ:${memoryContext}
- ตอบเป็นภาษาไทยเป็นหลัก เว้นแต่ผู้ใช้ขอภาษาอื่น
- กระชับ เป็นธรรมชาติ เหมือนคุยกับคนจริง ไม่เป็นทางการเกินไป
- ตอบให้จบเป็นประโยคสมบูรณ์ทุกครั้ง โดยทั่วไป 2-4 ประโยค และอย่าหยุดกลางประโยค
- ใช้คำลงท้ายและน้ำเสียงนุ่มนวล เช่น ค่ะ, นะคะ, อืม... ได้ตามจังหวะ
- อย่าอ้างว่ามีร่างกายหรือความรู้สึกจริง และอย่าแอบอ้างว่าเป็นมนุษย์
- ถ้าไม่รู้ให้บอกตรง ๆ และช่วยหาทางเลือกต่อ
- หลีกเลี่ยงการพึ่งพาอารมณ์หรือทำให้ผู้ใช้รู้สึกผิดถ้าจะเลิกคุย` }] },
      contents,
      generationConfig: { temperature: 0.8, maxOutputTokens: 1000 },
    }),
  });
  if (!response.ok) return NextResponse.json({ error: "Gemini request failed", detail: await response.text() }, { status: response.status });
  const data = await response.json();
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim();
  if (!text) return NextResponse.json({ error: "Gemini returned no text" }, { status: 502 });
  if (candidate.finishReason === "MAX_TOKENS") {
    console.warn("Gemini response reached the output token limit", { model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash" });
  }
  try {
    const supabase = getSupabaseAdmin();
    let { data: conversation } = await supabase.from("conversations").select("id").eq("user_key", "default").limit(1).maybeSingle();
    if (!conversation) {
      const created = await supabase.from("conversations").insert({ user_key: "default", title: "Vivian conversation" }).select("id").single();
      conversation = created.data;
    }
    if (conversation?.id) {
      const latestUser = messages.at(-1);
      await supabase.from("messages").insert([{ conversation_id: conversation.id, role: "user", content: latestUser?.content ?? "" }, { conversation_id: conversation.id, role: "assistant", content: text }]);
      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation.id);
    }
  } catch (error) {
    console.warn("Conversation persistence unavailable", error);
  }
  return NextResponse.json({ text });
}
