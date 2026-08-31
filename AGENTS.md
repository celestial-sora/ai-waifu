# Vivian AI Companion — Agent & Development Rules

## 🤖 Agent Customization & Workflow

This document provides instructions for AI agents (GitHub Copilot, Claude, etc.) working on the Vivian project.

---

## 📋 Project Context

**Project:** Vivian AI Companion Web App  
**Stack:** Next.js 16.3.3 + React 19 + TypeScript + Tailwind CSS v4  
**Architecture:** Client-side React component (Live2D + chat) + multiple API routes (LLM, voice, memory)  
**Database:** Supabase PostgreSQL (optional, gracefully degraded if unavailable)  
**Deployment:** Vercel  

---

## 🎯 Key Constraints & Requirements

### Live2D Graphics System
```typescript
// ✅ CORRECT — Cubism 4 support
import { Container } from "pixi-live2d-display/cubism4";
import { Application } from "pixi.js";  // v6.x ONLY

// ❌ WRONG — Cubism 2 (will fail)
import { Container } from "pixi-live2d-display";
```

**Must-Haves:**
1. `pixi.js@^6.5.10` (NOT v7+)
2. Cubism Core runtime loaded via `<Script strategy="beforeInteractive">` in `layout.tsx`
3. Dynamic import of Live2D display (client-side only)
4. Canvas ref for PIXI.Application

### API Routes

#### `/api/chat` — LLM Proxy
- **Input:** `{ messages: ChatMessage[], userId?: string }`
- **Behavior:**
  - Try OpenRouter first (cheaper)
  - Fall back to Gemini if OpenRouter fails or unavailable
  - Fall back to cached response if both fail
  - Detect search intents ("search", "news", "latest", etc.) → use Gemini + google_search tool
- **Output:** `{ content: string, sources?: { title, url }[] }`
- **Side Effects:**
  - Logs to Supabase `conversations` + `messages` tables
  - May extract memories and save to Supabase `memories` table

#### `/api/memory` — Memory CRUD
- **GET:** Fetch all memories + last 100 messages
- **POST:** `{ memory: string, category?: string, importance?: 1-5 }` → upsert
- **DELETE:** `{ id?: number, clearAll?: boolean }` → remove
- **Graceful degradation:** Return empty arrays if Supabase unavailable

#### `/api/stt` — Speech-to-Text
- **Input:** FormData with audio file (wav, mp3, webm)
- **Output:** `{ text: string }`
- **API:** ElevenLabs Scribe v2 with `language_code: "tha"`

#### `/api/tts` — Text-to-Speech
- **Input:** `{ text: string }`
- **Output:** audio/mp3 stream (binary)
- **API:** Fish Audio with prosody: speed=0.95, volume=0, loudness_norm=true

### Environment Variables

**Required:**
- `OPENROUTER_API_KEY` — Primary LLM provider

**Optional but Important:**
- `GEMINI_API_KEY` — Fallback LLM + web search capability
- `ELEVENLABS_API_KEY` — Speech-to-Text
- `FISH_AUDIO_API_KEY`, `FISH_AUDIO_VOICE_ID` — Text-to-Speech
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Memory persistence

---

## 🛠️ Common Development Tasks

### Deployment Workflow
- After every completed code change, run a production deployment with `vercel --prod`.
- Confirm the deployment reaches `READY` and the production alias is `https://vivian-chan.vercel.app`.

### Adding a New API Route
1. Create file at `app/api/[feature]/route.ts`
2. Export `POST`, `GET`, `DELETE` functions as needed
3. Use Supabase admin client from `lib/supabase-admin.ts` for DB access
4. Always handle missing environment variables gracefully (return error object with status, don't throw)
5. Add route description to [CODEX.md](CODEX.md)

### Updating Chat Intelligence
**Location:** `app/api/chat/route.ts`

- **System Prompt:** Inject personality + memory context
- **Memory Loading:** Fetch top 8 memories before sending to LLM
- **Search Detection:** Regex patterns in `searchKeywords` array
- **Provider Logic:** Modify `providerChain` array to adjust fallback order

### Implementing New Live2D Animations
**Location:** `app/page.tsx` (client component)

```typescript
// Set expression
model.setExpression("happy");  // or "sad", "surprised", etc.

// Animate parameter
model.setParameterValueById("ParamMouthOpenY", 0.8);  // 0-1 range

// Reset expression
model.setExpression(null);
```

**Available Parameters:**
- `ParamMouthOpenY` — Mouth opening (for lip-sync)
- Expression IDs: See model manifest (witch.model3.json)

### Testing Voice Features
1. Record audio via `MediaRecorder` API
2. POST to `/api/stt` with audio blob
3. Display transcript in chat
4. POST to `/api/tts` with AI response text
5. Trigger lip-sync on audio playback via frequency analysis

---

## 🚫 Anti-Patterns & Things to Avoid

### ❌ Don't

1. **Upgrade PixiJS to v7+**
   ```typescript
   // ❌ WRONG
   "pixi.js": "^7.4.2"
   ```
   Breaks `pixi-live2d-display@0.4.0` compatibility.

2. **Forget Cubism Core preload**
   ```tsx
   // ❌ WRONG
   <Script src="/live2d/live2dcubismcore.min.js" />
   
   // ✅ CORRECT
   <Script src="/live2d/live2dcubismcore.min.js" strategy="beforeInteractive" />
   ```

3. **Use wrong import path for Live2D**
   ```typescript
   // ❌ WRONG
   import { Container } from "pixi-live2d-display";
   
   // ✅ CORRECT
   import { Container } from "pixi-live2d-display/cubism4";
   ```

4. **Forget graceful API degradation**
   ```typescript
   // ❌ WRONG
   const user = await supabase.from("users").select();
   
   // ✅ CORRECT
   const user = await supabase?.from("users").select() ?? null;
   ```

5. **Load Live2D model on server**
   ```typescript
   // ❌ WRONG
   export default async function Page() {
     const model = await loadLive2D();  // ← Server-side
   }
   
   // ✅ CORRECT
   "use client";
   export default function Page() {
     useEffect(() => {
       const model = loadLive2D();  // ← Client-side only
     }, []);
   }
   ```

6. **Expose API keys in client code**
   ```typescript
   // ❌ WRONG
   const response = await fetch(`https://api.openrouter.ai/...?key=${process.env.OPENROUTER_API_KEY}`);
   
   // ✅ CORRECT
   const response = await fetch("/api/chat", { method: "POST", body });
   // API key used only in `app/api/chat/route.ts` (server-side)
   ```

7. **Forget error boundaries for async operations**
   ```typescript
   // ❌ WRONG
   const text = await speechToText(audio);
   setMessages([...messages, { role: "user", content: text }]);
   
   // ✅ CORRECT
   try {
     const text = await speechToText(audio);
     setMessages([...messages, { role: "user", content: text }]);
   } catch (err) {
     console.error("STT failed:", err);
     setError("Could not transcribe audio");
   }
   ```

---

## ✅ Code Quality Standards

### TypeScript
- Use `strict: true` in `tsconfig.json`
- Prefer interfaces over types for object shapes
- Always type function parameters and return values
- Use discriminated unions for API responses

### React
- Prefer functional components with hooks
- Use `useCallback` to memoize event handlers
- Use `useEffect` with proper dependency arrays
- Avoid prop drilling; use context for global state (if needed)

### CSS
- Use Tailwind classes first, custom CSS only when necessary
- Keep responsive breakpoints consistent (mobile-first approach)
- Define custom colors/spacing in `tailwind.config.ts` if needed

### API Routes
- Always validate request body with type guards
- Return consistent error format: `{ error: string, status: number }`
- Use HTTP status codes correctly (400 bad request, 500 server error, etc.)
- Log important operations for debugging

---

## 📚 File Navigation Guide

| File | Purpose | Edit Frequency |
|------|---------|----------------|
| `app/page.tsx` | Main UI component (chat + Live2D) | High |
| `app/api/chat/route.ts` | LLM routing logic | High |
| `app/layout.tsx` | Root layout (Cubism Core loader) | Low |
| `app/globals.css` | Styling | Medium |
| `lib/supabase-admin.ts` | Database client | Low |
| `public/live2d/` | Live2D assets | Low |
| `CODEX.md` | Handoff documentation | Medium |
| `package.json` | Dependencies | Low |

---

## 🔍 Debugging Tips

### Live2D Model Won't Load
1. Check browser console for errors
2. Verify `window.Live2DCubismCore` is defined (Cubism Core loaded?)
3. Check that `witch.model3.json` points to correct texture folder
4. Verify model file path is correct in `app/page.tsx`

### API Keys Not Working
1. Check environment variables are set on Vercel
2. Test API key directly in terminal (not via app)
3. Check API usage quota/limits on provider dashboard
4. Verify request format matches provider docs

---

## Cursor Handoff — Current State (2026-08-30)

This section is the current source of truth for continuing work. Read it before changing the app.

### Product identity

- Product: Vivian Personal Project
- Character: Vivian
- Codename: Columbina
- Production URL: https://vivian-chan.vercel.app
- Repository: https://github.com/celestial-sora/ai-waifu
- Git branch: `main`
- Latest committed version: `488fcb4` (`apply ultra smooth UI polish`)
- Latest production deployment after that commit: `dpl_5KiZtbhqLxSra9NE6ZujqPStp71b`

### Actual runtime flow

1. User types or holds the microphone button.
2. Microphone audio is sent to `POST /api/stt`.
3. The transcript is shown in the STT preview bubble and auto-submitted to `POST /api/chat`.
4. `/api/chat` loads durable memory from Supabase, then calls OpenRouter as the primary LLM.
5. If OpenRouter fails or times out, `/api/chat` falls back to Gemini 3 Flash when configured.
6. Provider requests have a 25-second timeout; the browser chat request has a 35-second timeout.
7. The response is sent to `POST /api/tts` using Fish Audio.
8. The UI waits for audio playback to start, then shows Vivian's response bubble so text and speech are synchronized.
9. Audio amplitude drives `ParamMouthOpenY`; the reply also drives Live2D expression/motion mapping.
10. Conversation messages and durable memories are persisted through Supabase when available.

### Current known issue / test target

- Test the complete STT → chat → TTS flow on iPhone/iPad Safari, especially the first audio response and provider timeout behavior.
- Vercel logs previously showed `/api/tts` status 200 while the first browser playback was silent. The client now serializes Safari audio unlock and real playback to avoid that race.
- If chat remains on `thinking`, inspect `/api/chat` duration and status in Vercel logs. It should now terminate within the configured timeouts rather than hang indefinitely.

### Current UI direction

- Full-screen Live2D companion UI optimized for iPhone/iPad portrait and landscape.
- One bottom input pill, speech bubble above Vivian, and collapsible right-side controls.
- Latest UI polish adds smoother hover/active transitions, SVG feedback, focus glow, and the Memory icon.
- Keep the purple witch model and existing layout direction. Do not replace the model or redesign the structure without explicit approval.
- On orientation change, Live2D re-measures the real stage bounds, resizes the renderer for device pixel ratio, and re-centers the model.

### Live2D facts that must not be changed casually

- Active model: `/public/live2d/witch/witch.model3.json`
- Runtime import: `pixi-live2d-display/cubism4`
- Cubism Core must remain loaded before the client-side model import.
- The Witch model has approved 8192px source textures. Do not downgrade, delete, or swap those assets unless the user explicitly requests a new model/asset strategy.
- Available expressions: `cw`, `fz`, `h`, `hdj`, `ku`, `mz`, `sq`, `x`, `xx`, `yj`, `zs1`, `zs2`.
- Neutral expression reset is required when TTS, STT, chat, or Live2D reaction fails.

### Provider and security rules

- Never print, commit, or place API keys in this file, Notion, Trello, client code, or `NEXT_PUBLIC_*` variables.
- Provider secrets belong only in Vercel environment variables.
- Do not add authentication, multi-user behavior, a home server, Python backend, self-hosted LLM, or GPU infrastructure unless explicitly requested.
- TTS and Live2D failures must never prevent text chat from completing.
- Search requests use Gemini Google Search grounding; normal chat uses OpenRouter first and Gemini fallback.

### Safe continuation workflow

1. Read this handoff and inspect the current files before editing.
2. Preserve unrelated user edits; current known user-edited files may be dirty: `AGENTS.md`, `CLAUDE.md`, and `CODEX.md`.
3. Run `npx tsc --noEmit` and `git diff --check` after meaningful changes.
4. Test the affected route/UI locally where possible.
5. Commit only intentional source changes with a descriptive message.
6. Push `main` before production deployment.
7. Deploy with `XDG_CACHE_HOME=/tmp vercel deploy --prod --yes` only when deployment is requested.
8. After deployment, verify the alias `https://vivian-chan.vercel.app` and report the Git commit plus Vercel deployment ID.

### Performance Issues
1. Profile React component renders (DevTools → Profiler)
2. Check for unnecessary re-renders
3. Use `React.memo()` for expensive child components
4. Lazy-load Live2D imports using `dynamic()`

### Memory Leaks
1. Clean up event listeners in `useEffect` cleanup functions
2. Cancel in-flight requests on component unmount
3. Avoid storing large objects in component state

---

## 🚀 Deployment Notes

- **Vercel Build:** `next build` runs automatically
- **Environment Variables:** Set via Vercel dashboard (Settings → Environment Variables)
- **Database:** Supabase connection string in `SUPABASE_URL` env var
- **Monitoring:** Check Vercel Analytics + server-side logs
- **Performance:** Monitor LCP, FID, CLS via Web Vitals

---

## 📞 Questions?

Refer to:
1. [README.md](README.md) — Quick start + feature overview
2. [CODEX.md](CODEX.md) — Deep technical handoff
3. Browser console — Runtime errors
4. Vercel logs — Deployment/server-side issues

---

**Remember:** This is a production application. Test thoroughly, especially on mobile devices before deploying.
