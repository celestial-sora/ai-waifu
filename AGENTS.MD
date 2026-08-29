# Vivian Personal Project — Agent Notes

## Product

- Name: Vivian Personal Project
- Character: Vivian
- Codename: ดวงดาว
- Production URL: https://vivian-chan.vercel.app
- GitHub: https://github.com/celestial-sora/ai-waifu
- Primary devices: iPhone and iPad Safari

## Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS
- Vercel Hobby
- Gemini for chat and Google Search grounding
- ElevenLabs for STT and TTS
- Supabase PostgreSQL for conversations, messages, and memories
- Live2D Cubism 4 model with 4096px textures

## Product Rules

- Keep the companion UI full-screen and reference-inspired: Live2D character, speech bubble, side controls, and one bottom input pill.
- Treat iPhone/iPad portrait and landscape as the primary layouts. Preserve safe-area and touch-friendly behavior.
- Vivian speaks Thai with occasional natural English phrases.
- Do not use emoji in UI or character responses.
- Keep camera and GPS out of scope unless explicitly requested.
- TTS and Live2D failures must not break text chat.
- Use the existing Vivian model paths and preserve 4096px textures for iPad stability.

## Memory and Search

- /api/memory stores conversations and durable memories through Supabase.
- Save only useful, durable user facts; never save API keys, passwords, or highly sensitive data.
- The memory manager is opened from the right-side companion control.
- /api/chat uses Gemini grounding when the user asks for current or web-based information and includes source links when available.
- Keep provider API keys in server-side environment variables only. Never use NEXT_PUBLIC_* for secrets.

## Workflow

- Run npx tsc --noEmit and git diff --check after meaningful changes.
- Run npm run build or rely on the Vercel production build before deployment.
- Push source changes to main before production deployment.
- Deploy with XDG_CACHE_HOME=/tmp vercel deploy --prod --yes.
- Do not add authentication or multi-user behavior unless explicitly requested.
- Update Notion and Trello when a feature or milestone changes status.
