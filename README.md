# Vivian AI Companion

Vivian is a mobile-first **Live2D AI companion** focused on natural conversation, voice interaction, long-term memory, vision, connected tools, and a proactive yandere-style roleplay personality.

**Current app codename:** `Sandrome`  
**Production:** https://vivian-chan.vercel.app  
**Repository:** https://github.com/celestial-sora/ai-waifu  
**Primary branch:** `main`

> This README reflects the current implementation on `main` as of September 18, 2026.

## ใช้งานบนเครื่อง (localhost)

ต้องมี Git และ Node.js พร้อม npm ก่อนเริ่มต้น จากนั้นเปิด Terminal แล้วรัน:

```bash
git clone https://github.com/celestial-sora/ai-waifu.git
cd ai-waifu
npm ci
cp .env.example .env.local
```

บน Windows PowerShell ใช้ `Copy-Item .env.example .env.local` แทนคำสั่ง `cp`

เปิด `.env.local` และตั้งค่า API key ก่อนเริ่มเว็บ โดยเลือกผู้ให้บริการแชตอย่างน้อยหนึ่งราย หากไฟล์ตัวอย่างยังไม่มีชื่อตัวแปรที่ต้องใช้ ให้เพิ่มบรรทัดนั้นเอง:

### ตั้งค่า `.env.local`

#### ผู้ให้บริการแชต

At least one normal chat provider must be configured:

```env
CEREBRAS_API_KEY=
GROQ_API_KEY=
GEMINI_API_KEY=
```

Optional model overrides:

```env
GROQ_MODEL=openai/gpt-oss-120b
GEMINI_MODEL=gemini-2.5-flash
```

Gemini is required for the current vision/search route.

#### ความจำและบริบท

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

OPENROUTER_API_KEY=
OPENROUTER_MODEL=
```

Supabase provides persistence. OpenRouter is optional for normal chat but enables the current memory-extraction and older-context compression flow.

#### ค้นหาและเครื่องมือ

```env
TAVILY_API_KEY=
COMPOSIO_API_KEY=
```

#### เสียง

```env
ELEVENLABS_API_KEY=

FISH_AUDIO_API_KEY=
FISH_AUDIO_VOICE_ID=
FISH_AUDIO_MODEL=s2.1-pro-free
```

Never place provider secrets in `NEXT_PUBLIC_*`, client code, committed source files, screenshots, or logs.

### เริ่มใช้งาน

```bash
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000) ในเบราว์เซอร์เพื่อคุยกับ Vivian ผ่านหน้าเว็บ หากต้องการพูดหรือใช้กล้อง ให้กดอนุญาตไมโครโฟน/กล้องในเบราว์เซอร์และตั้งค่าบริการเสียงที่เกี่ยวข้อง กด `Ctrl+C` ใน Terminal เพื่อหยุดเซิร์ฟเวอร์

สำหรับการตรวจโปรเจกต์ ใช้ `npm run lint`, `npx tsc --noEmit` และ `npm run build`

## Current status

The project is now beyond a basic chat + Live2D prototype. The current build includes:

- Live2D Cubism 4 rendering with the **Miss** model
- Proactive yandere companion behavior with relationship state and conversational agency
- Multi-provider LLM routing with fallback
- Persistent memories, editable memory management, and conversation history
- Voice input and voice output with lip sync
- Camera/image vision support
- Multi-language conversation and speech modes
- Web search and utility tools
- Connected-app tool execution through Composio
- Mobile/iPhone/iPad-oriented rendering, audio unlock, timeout handling, and orientation support
- API rate limiting and bounded provider timeouts

## AI / roleplay behavior

Vivian is not implemented as a stateless assistant. The companion maintains relationship and mood state across conversations.

Current companion state includes:

- `affinity`
- `trust`
- `familiarity`
- persistent mood + mood intensity
- compressed conversation summary
- last interaction / idle timestamps

Supported mood states currently include:

`calm`, `warm`, `playful`, `shy`, `tired`, `melancholy`, and `yandere`.

The current personality system gives Vivian more conversational agency: she can initiate topics, tease, flirt, become possessive in-character, bring previous context back into the conversation, and continue a roleplay scene without always returning control to the user.

The yandere behavior is intentionally treated as **character flavor inside the conversation**, not as permission to pressure or control the user's real life.

## LLM routing

Normal text chat currently uses this provider order:

1. **Cerebras** — `qwen-3.8-27b`
2. **Groq** — default `openai/gpt-oss-120b`
3. **Gemini** — default `gemini-2.5-flash`

Vision and search requests are routed through Gemini because they depend on Gemini-specific multimodal/search capabilities.

OpenRouter is no longer the primary chat provider. It is still used when configured for background memory extraction and conversation-context compression.

### Search flow

Search-aware requests currently combine:

- **Tavily** retrieval for search context
- **Gemini Google Search grounding** for grounded search responses

Other built-in tools include:

- Current time/date in `Asia/Bangkok`
- Weather via Open-Meteo
- Calculator
- Memory retrieval

## Connected apps / Composio

Vivian has a Composio integration that can discover connected accounts, select relevant tools, and execute tool calls through supported connected services.

The current intent routing recognizes integrations such as:

- YouTube
- Discord
- Spotify
- GitHub
- Google Calendar
- Gmail
- Notion
- Slack
- Twitter / X

Available actions depend on the accounts and permissions actually connected to Composio.

## Vision

Vivian can receive visual context in two ways:

- Image/file attachment
- Live camera mode

The browser UI can capture camera frames and send them to the chat route for vision analysis. Live vision reactions are rate-limited/cooldown-controlled so the companion does not continuously spam requests.

## Voice

### Speech-to-text

Voice input uses **ElevenLabs Scribe v2**.

The selected language can be forwarded to STT to reduce incorrect language/script detection from background noise.

### Text-to-speech

Voice output uses **Fish Audio**.

The current TTS path includes:

- speech-speed control
- punctuation/style-aware delivery tuning
- Thai/English boundary cleanup
- MP3 output
- bounded upstream timeout handling
- browser audio-unlock handling for Safari/iOS
- Live2D lip sync driven by playback amplitude

## Languages

The current UI supports these language modes:

- Global / automatic
- Thai
- English
- Japanese
- Korean
- Chinese

The selected language is used by the companion prompt and voice pipeline.

## Memory system

Memory is stored in Supabase PostgreSQL.

Current memory functionality includes:

- Load persistent memories
- Save/upsert memories
- Edit existing memories
- Delete individual memories
- Clear conversation history
- Load recent conversation messages
- Use the most relevant/recent memory context in prompts
- Update memory usage timestamps
- Extract durable memories from conversation when OpenRouter is configured
- Compress older conversation turns into a compact conversation summary

Sensitive one-off information and secrets are explicitly excluded from automatic memory extraction.

## Live2D

Current model:

`/public/live2d/Miss/Miss.model3.json`

Runtime:

- PixiJS `6.5.x`
- `pixi-live2d-display/cubism4`
- Cubism Core loaded before the client model runtime

The model includes multiple expressions and reacts to companion state / responses. Audio amplitude is mapped to mouth movement for lip sync.

The renderer includes mobile-specific resolution and performance handling, especially for iPhone/iPad Safari.

## Tech stack

- Next.js 16.3.3
- React 19.2.8
- TypeScript 5
- Tailwind CSS 4
- PixiJS 6.5
- pixi-live2d-display 0.4
- Supabase PostgreSQL
- Vercel

External AI/services currently used by the codebase include:

- Cerebras
- Groq
- Google Gemini
- OpenRouter
- Tavily
- ElevenLabs
- Fish Audio
- Composio
- Open-Meteo

## Current limitations

The current production architecture is still a **personal single-user project** rather than a multi-user platform.

Notable limitations:

- Server-side persistence currently uses `userKey = "default"`.
- There is no full application-level multi-user authentication/authorization system yet.
- The active Live2D model configuration currently contains only `Miss`.
- Vision/search depend on Gemini availability.
- Connected-app capabilities depend on Composio account connections and their external permissions.
- In-memory rate-limit buckets are instance-local and are not a distributed rate-limit store.

## Privileged owner / agent policy

Repository automation and privileged agent workflows are intended only for the authorized contributor:

`celestial-sora`

For verified `celestial-sora`, project agents may use connected capabilities required for an explicitly requested task, including private project context, connected services, calendar context, and available computer/browser automation.

This is currently an **agent/repository authorization policy**, not a claim that the web application itself has implemented contributor-based authentication.

Private-data access for an owner-requested task does not automatically authorize publication or disclosure. Passwords, API keys, cookies, access tokens, service-role keys, recovery codes, and unrelated private information must not be committed, logged, or exposed.

## Development notes

- Keep PixiJS on v6 while using `pixi-live2d-display@0.4.0`.
- Keep Cubism Core loaded with `beforeInteractive`.
- Do not load Live2D on the server.
- Provider failures must not leave the UI permanently stuck in a thinking/speaking state.
- TTS or Live2D failures should not prevent text chat from completing.
- Preserve mobile Safari audio-unlock behavior when changing the voice pipeline.
- Keep API credentials server-side only.

## License / Live2D credit

Live2D Credit: **Cai Cat**

This repository contains a personal AI companion project and its application code. Model/assets may have separate usage terms from the source code.

## Project structure

```text
app/
  page.tsx              Main Live2D companion UI
  api/
    chat/               LLM routing, tools, vision, memory-context orchestration
    memory/             Memory + conversation CRUD
    stt/                ElevenLabs speech-to-text
    tts/                Fish Audio text-to-speech

lib/
  companion.ts          Relationship, mood and yandere-agency state
  companion-store.ts    Companion-state persistence
  composio.ts           Connected-app tools
  models.ts             Live2D model configuration
  tools.ts              Search, weather, time, calculator, memory tools
  rate-limit.ts         API request throttling
  supabase-admin.ts     Server-side Supabase client

public/
  live2d/Miss/          Current Live2D model/assets
  backgrounds/          Day/night scene assets

supabase/
  migrations/           Database schema migrations
```
