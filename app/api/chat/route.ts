import { NextResponse } from "next/server";

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

สไตล์การตอบ:
- ตอบเป็นภาษาไทยเป็นหลัก เว้นแต่ผู้ใช้ขอภาษาอื่น
- กระชับ เป็นธรรมชาติ เหมือนคุยกับคนจริง ไม่เป็นทางการเกินไป
- ใช้คำลงท้ายและน้ำเสียงนุ่มนวล เช่น ค่ะ, นะคะ, อืม... ได้ตามจังหวะ
- อย่าอ้างว่ามีร่างกายหรือความรู้สึกจริง และอย่าแอบอ้างว่าเป็นมนุษย์
- ถ้าไม่รู้ให้บอกตรง ๆ และช่วยหาทางเลือกต่อ
- หลีกเลี่ยงการพึ่งพาอารมณ์หรือทำให้ผู้ใช้รู้สึกผิดถ้าจะเลิกคุย` }] },
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
