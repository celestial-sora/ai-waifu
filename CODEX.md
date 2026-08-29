# Yuino AI Companion — Codex Handoff

## Project Overview

**Yuino** คือ mobile-first AI companion web app ที่แสดง Live2D model แบบ fullscreen พร้อม chat interface เชื่อมต่อกับ Gemini API

- **URL (Production):** https://ai-waifu-nine.vercel.app
- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- **Hosting:** Vercel (project: `ai-waifu`)
- **AI Backend:** Google Gemini API (`gemini-2.5-flash`)
- **Live2D:** pixi-live2d-display@0.4.0 + PixiJS 6 + Cubism 4

---

## Project Structure

```
ai-waifu/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # Gemini API proxy (POST /api/chat)
│   ├── globals.css               # All styles (minified single-line, Tailwind + custom CSS)
│   ├── layout.tsx                # Root layout — loads Cubism 4 Core script (beforeInteractive)
│   └── page.tsx                  # Main page — Live2D canvas + chat UI (single "use client" component)
├── public/
│   └── live2d/
│       ├── live2dcubismcore.min.js   # Cubism 4 Core runtime (self-hosted, ~202KB)
│       └── yuino/
│           ├── Yuino.model3.json     # Live2D model manifest (points to Yuino.4096 textures)
│           ├── Yuino.moc3            # Live2D Cubism 4 model data (~19MB)
│           ├── Yuino.physics3.json   # Physics simulation data
│           ├── Yuino.cdi3.json       # Display info
│           ├── Yuino.4096/           # ✅ ACTIVE — 4096px textures (iOS-safe, ~10MB total)
│           │   ├── texture_00.png    # 4096×4096 (~4.6MB)
│           │   ├── texture_01.png    # 4096×4096 (~3.0MB)
│           │   ├── texture_02.png    # 4096×4096 (~2.3MB)
│           │   ├── texture_03.png    # 4096×2048 (~197KB)
│           │   ├── texture_04.png    # (~3KB)
│           │   ├── texture_05.png    # (~3KB)
│           │   └── texture_06.png    # (~3KB)
│           └── Yuino.8192/           # ⚠️ UNUSED — original 8192px textures (crashes iOS Safari)
│               └── texture_00–06.png # 8192×8192 (~41MB total) — kept for reference
├── package.json
├── next.config.ts
├── tsconfig.json
└── CODEX.md                          # This file
```

---

## Key Files

### `app/layout.tsx`
โหลด **Cubism 4 Core runtime** ก่อนที่ JS bundle จะทำงาน โดยใช้ `strategy="beforeInteractive"` ซึ่งจำเป็นสำหรับ `pixi-live2d-display/cubism4` ที่ตรวจสอบ `window.Live2DCubismCore` ตอน import

```tsx
<Script src="/live2d/live2dcubismcore.min.js" strategy="beforeInteractive" />
```

### `app/page.tsx`
Single component ที่ทำทุกอย่าง:
- โหลด Live2D model ผ่าน dynamic import (`pixi.js` + `pixi-live2d-display/cubism4`)
- สร้าง PIXI.Application บน `<canvas>` ref
- แสดง chat bubbles + input ส่งข้อความไปยัง `/api/chat`
- Responsive (Tailwind + custom media query ใน globals.css)

### `app/api/chat/route.ts`
Next.js Route Handler — รับ POST body `{ messages: ChatMessage[] }` แล้ว forward ไปยัง Gemini API

**Environment variables ที่ต้องตั้งบน Vercel:**

| Variable | ค่า |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio API key (required) |
| `GEMINI_MODEL` | model ID เช่น `gemini-2.5-flash` (optional, default: `gemini-2.5-flash`) |

---

## Bugs Fixed

### Fix 1 — Missing Cubism 4 Core Runtime
**อาการ:** "โหลดโมเดลไม่สำเร็จ" บน Vercel ทันทีที่เปิด  
**สาเหตุ:** `pixi-live2d-display` ต้องการ `window.Live2DCubismCore` ก่อน import แต่ไม่มีไฟล์ runtime โหลดไว้  
**แก้:** ดาวน์โหลด `live2dcubismcore.min.js` มา self-host ที่ `public/live2d/` แล้วโหลดใน `layout.tsx` ด้วย `strategy="beforeInteractive"`

### Fix 2 — PixiJS Version Mismatch
**อาการ:** Live2D โหลดไม่ได้ แม้ Cubism Core พร้อมแล้ว  
**สาเหตุ:** โปรเจกต์ใช้ `pixi.js@7` แต่ `pixi-live2d-display@0.4.0` peer-depends บน `@pixi/*@^6` เท่านั้น  
**แก้:** ดาวน์เกรด `pixi.js` จาก `^7.4.2` → `6.x`

### Fix 3 — Wrong Import Path (Cubism 2 Error)
**อาการ:** `Error: Could not find Cubism 2 runtime. This plugin requires live2d.min.js to be loaded.`  
**สาเหตุ:** `import("pixi-live2d-display")` default entry โหลด Cubism 2 + 4 runtime handler ทั้งคู่ แต่ไม่มี `live2d.min.js`  
**แก้:** เปลี่ยน import เป็น `import("pixi-live2d-display/cubism4")` เพราะโมเดล Yuino เป็น `.moc3` (Cubism 4)

### Fix 4 — iPad Crash (WebGL Texture Size Limit)
**อาการ:** รันได้บน PC แต่ crash บน iPad ทันที  
**สาเหตุ:** iOS Safari มี WebGL max texture = **4096×4096px** แต่ texture ทุกไฟล์เป็น **8192×8192px**  
**แก้:** Resize texture ทั้งหมดด้วย ImageMagick → สร้าง `Yuino.4096/` → อัปเดต `Yuino.model3.json` ให้ชี้ folder ใหม่

---

## Dependencies

```json
{
  "dependencies": {
    "next": "16.3.3",
    "pixi-live2d-display": "^0.4.0",
    "pixi.js": "^6",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  }
}
```

> ⚠️ **อย่าอัปเกรด `pixi.js` เป็น v7 หรือ v8** — `pixi-live2d-display@0.4.0` รองรับแค่ PixiJS v6

---

## Known Limitations / Next Steps

- **ไม่มี idle animation** — โมเดลโหลดขึ้นมาแต่ยังไม่มี motion (ยังไม่ได้ configure `.motion3.json`)
- **ไม่มี Lip Sync** — `LipSync` Ids ใน `model3.json` เป็น array ว่าง
- **ไม่มี conversation history ถาวร** — chat ล้างทุกครั้งที่ reload
- **ปุ่ม Mic ยังไม่ทำงาน** — UI-only ยังไม่ได้ต่อ Web Speech API
- **`Yuino.8192/` ยังอยู่ใน repo** — สามารถลบออกได้เพื่อลด size (~41MB) เพราะไม่ใช้แล้ว
