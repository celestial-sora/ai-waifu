# Vivian AI Companion

เว็บ AI companion แบบ Live2D สำหรับ Vivian โดยเน้นการใช้งานบน iPhone และ iPad

Production: ไม่มีเว็บให้ลองเล่นหรอก baka 

## Current features

- Live2D Cubism 4 รุ่น Miss ใช้ texture ต้นฉบับ 4096×4096
- โหลดโมเดลทีละตัวและจัดตำแหน่งใหม่เมื่อเปลี่ยน orientation
- Render บน Apple mobile สูงสุด 1.5x ของ CSS resolution เพื่อเพิ่มความคม โดยมีเพดานกัน Safari crash
- Chat แบบ text และ session greeting
- Speech-to-Text แบบเปิด/ปิดไมค์ พร้อม voice activity detection, noise suppression และ STT preview
- Text-to-Speech ผ่าน Fish Audio โดยข้อความจะแสดงหลังเสียงเริ่มเล่น เพื่อให้ภาพและเสียงมาพร้อมกัน
- Lip sync จาก audio amplitude บน desktop และ timing-based lip sync บน iOS
- Memory และประวัติการสนทนาผ่าน Supabase แบบ graceful degradation
- Mood ถาวร, affinity, trust, familiarity และ mood intensity ระดับ 0–100
- Mood decay ลดความเข้มของอารมณ์ทุก 2 ชั่วโมง และกลับสู่ calm เมื่ออารมณ์เบาลง
- Expression ของ Miss ครบ 15 แบบ โดยเลือกตามสถานการณ์และ mood แบบ deterministic ไม่สุ่ม
- Expression-to-motion pairing รองรับ motion group หากโมเดลมี และ fallback เป็น Idle หากไม่มี
- Web search ใช้ Gemini พร้อม Google Search grounding

## Manual expression commands

สามารถควบคุม expression ของโมเดล Miss จากช่องแชตได้โดยตรง คำสั่งเหล่านี้ทำงานใน browser และไม่ส่งข้อความไปยัง LLM:

```text
/expression list
/expression M love
/expression M wenhao
/expression default
```

ใช้ `/exp` แทน `/expression` ได้ และไม่จำเป็นต้องพิมพ์ช่องว่างท้ายชื่อ expression เช่น `M wenhao` ระบบจะจับคู่ให้เอง

## Expression mapping

ระบบใช้ข้อความล่าสุดและ mood ประกอบการเลือก expression:

| Expression | ใช้เมื่อ |
| --- | --- |
| `#` | default หรือ calm |
| `M ###` | มอง ตากระพริบ ดูนี่ |
| `M ##` | งง ไม่เข้าใจ สงสัย |
| `M QAQ` | เศร้า เหงา เสียใจ |
| `M lianhong` | รัก คิดถึง กอด อบอุ่น |
| `M love` | เขิน อาย ถูกชม |
| `M miyan` | ยิ้ม ทักทาย ขอบคุณ |
| `M nu` | โกรธ หงุดหงิด ไม่พอใจ |
| `M wenhao` | ตกใจ ประหลาดใจ |
| `M xingxing` | ดีใจ ตื่นเต้น ฉลอง |
| `M xingxing2` | ขำ ตลก หัวเราะ |
| `S chabei` | ชา กาแฟ พัก เหนื่อย |
| `S shouji` | โทรศัพท์ ข้อความ แจ้งเตือน |
| `T faxing` | ทรงผม แต่งตัว รูปลักษณ์ |
| `X shetou` | แกล้ง หยอก จุ๊บ |

สถานการณ์ที่ตรวจพบจะมี priority สูงกว่า mood หากจับสถานการณ์ไม่ได้จึงใช้ mood เป็น fallback

## Provider architecture

Vercel ทำหน้าที่ serve หน้าเว็บและ proxy API เท่านั้น งาน LLM, STT และ TTS ทำผ่าน external API ไม่รันโมเดลหนักบนเครื่องผู้ใช้หรือ Vercel

- LLM หลัก: Groq (`GROQ_API_KEY`)
- LLM fallback: OpenRouter (`OPENROUTER_API_KEY`) และ Gemini ตามลำดับที่ตั้งค่าไว้
- Web search: Gemini (`GEMINI_API_KEY`)
- STT: ElevenLabs Scribe (`ELEVENLABS_API_KEY`)
- TTS: Fish Audio (`FISH_AUDIO_API_KEY`, `FISH_AUDIO_VOICE_ID`)
- Memory: Supabase PostgreSQL (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)

API routes:

- `POST /api/chat` — chat, provider fallback, mood state, memory context และ web search
- `GET/POST/DELETE /api/memory` — memory และ conversation history
- `POST /api/stt` — แปลงเสียงเป็นข้อความ
- `POST /api/tts` — สร้างเสียง MP3 จากข้อความ

## Local development

ต้องใช้ Node.js และตั้งค่า environment variables ใน `.env.local` โดยดูชื่อจาก `.env.example` ห้ามใส่ API key ลงใน source code หรือ commit ไฟล์ `.env.local`

```bash
npm install
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

ตรวจ production build:

```bash
npm run build
```

## Production deployment

โปรเจกต์เชื่อมกับ Vercel แล้ว การ deploy production ใช้:

```bash
vercel --prod
```

หลัง deploy ต้องตรวจว่า deployment เป็น `READY` และ alias ยังคงชี้ไปที่ `https://your-domain.vercel.app`

## Live2D constraints

- ใช้ `pixi.js@6.5.10` ร่วมกับ `pixi-live2d-display@0.4.0`
- ใช้ Cubism 4 import path เท่านั้น: `pixi-live2d-display/cubism4`
- Cubism Core ถูก preload จาก `app/layout.tsx`
- Live2D โหลดฝั่ง client ภายใน `useEffect` เท่านั้น
- อย่าเปลี่ยนกลับไปใช้ texture 8192 บน production เพราะ iPad/Safari อาจ crash
Model  cradit : Cai Cat
