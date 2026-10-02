# Vivian AI Companion

Vivian is a mobile-first **Live2D AI companion** focused on natural conversation, voice interaction, long-term memory, vision, connected tools, and a proactive yandere-style roleplay personality.

**Current app codename:** `Sandrome`  
**Production:** https://vivian-chan.vercel.app  
**Repository:** https://github.com/celestial-sora/ai-waifu  
**Primary branch:** `main`

> This README reflects the current implementation on `main` as of September 25, 2026.

## Run locally

Requires Git, Node.js, and npm.

```bash
git clone https://github.com/celestial-sora/ai-waifu.git
cd ai-waifu
npm ci
cp .env.example .env.local
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` for the last command.

### Configure `.env.local`

Set `GROQ_API_KEY` for the primary chat provider. `CEREBRAS_API_KEY` and `GEMINI_API_KEY` provide chat fallbacks. Gemini is also needed for vision and Gemini-backed search.

Other features are optional:

| Feature | Environment variables |
| --- | --- |
| Persistent memory | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Memory extraction and context compression | `CEREBRAS_API_KEY` |
| Search and connected apps | `TAVILY_API_KEY`, `COMPOSIO_API_KEY` |
| Jev current-information routing | `TYPESAFE_API_KEY` |
| Speech input | `GROQ_API_KEY` (optional `GROQ_STT_MODEL`) |
| Speech output | `FISH_AUDIO_API_KEY`, `FISH_AUDIO_VOICE_ID` (optional `FISH_AUDIO_MODEL`) |

Optional chat model overrides: `GROQ_MODEL` and `GEMINI_MODEL`. Keep keys in `.env.local`; never expose them through `NEXT_PUBLIC_*` or commit them.

### Start

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Allow microphone or camera access in your browser if you use those features. Press `Ctrl+C` to stop the server.

Checks: `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Current status

The project is now beyond a basic chat + Live2D prototype. The current build includes:

- Live2D Cubism 4 rendering with the **Miss** model
- Proactive yandere companion behavior with relationship state and conversational agency
- Fresh AI-generated greetings when the app opens or a new chat starts, with a local fallback when providers are unavailable
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

1. **Groq** — default `openai/gpt-oss-120b`
2. **Cerebras** — `qwen-3.8-27b`
3. **Gemini** — default `gemini-2.5-flash`

Vision and search requests are routed through Gemini because they depend on Gemini-specific multimodal/search capabilities.

When `TYPESAFE_API_KEY` and `GEMINI_API_KEY` are configured, Jev checks whether less explicit user requests need current web information. A strong Jev signal routes the request through the existing Tavily/Gemini search flow. Explicit search wording still routes directly, and Jev errors or timeouts leave the existing chat behavior intact. Jev is a decision model; it does not generate Vivian's replies. Keep the key on the server in `.env.local` or the Vercel environment. Web Settings shows its configured status through `GET /api/jev/status` without returning the key.

Background memory extraction and conversation-context compression use Cerebras when configured. `OPENROUTER_API_KEY` may remain in the environment for future use, but the app does not currently call OpenRouter.

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

Voice input uses **Groq Whisper Large V3 Turbo** by default. Set `GROQ_STT_MODEL=whisper-large-v3` to favor transcription accuracy over speed.

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
- Extract durable memories from conversation when Cerebras is configured
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
- Tavily
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
    stt/                Groq Whisper speech-to-text
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

### Licensed model assets

The purchased Miss model is not distributed with this repository. Its model files, textures, expressions, physics, and configuration are excluded from version control. To run the avatar locally, supply your own licensed copy at `public/live2d/Miss/`, with `Miss.model3.json` at `public/live2d/Miss/Miss.model3.json`. Without those files, the avatar is unavailable; text chat remains usable.

Do not commit model files or model archives. `.gitignore` does not restrict HTTP access: anything placed under `public/` is served publicly by Next.js. Do not include the purchased model in public deployments unless its license explicitly allows that distribution.

### After the Live2D history cleanup

All character model assets, including historical models, have been removed from Git history. The Cubism Core runtime remains tracked. A fresh clone can run text chat; the avatar requires your own licensed model files at the paths configured in `lib/models.ts`. Model assets must remain untracked and must not be redistributed.

For an existing clone, copy your licensed `public/live2d/` model folders to a private directory outside the repository before changing Git history. Save any uncommitted source changes separately. Clone the cleaned repository into a new directory, install dependencies, then copy your licensed models back into its ignored `public/live2d/` directory. Keep the tracked Cubism Core runtime from the fresh clone. Confirm `git status --short` does not list model assets before committing.

Do not merge or push old branches/tags into the cleaned repository: that restores the removed history. Reapply source changes as patches, excluding model assets. Retire the old clone after preserving your source changes and licensed files. Rewriting this repository cannot erase copies previously downloaded by other people.
