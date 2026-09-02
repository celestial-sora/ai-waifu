# Vivian AI Companion

An interactive Live2D AI companion for chatting, voice conversations, and persistent memories.

Vivian is built around the **Miss** Live2D character and designed for a smooth mobile experience on iPhone and iPad.

## Features

- Live2D Cubism 4 avatar with expressive reactions
- Text chat with provider fallback
- Speech-to-text and text-to-speech
- Lip sync driven by voice playback
- Persistent memories and conversation history
- Mood, affinity, trust, and familiarity state
- Custom Instructions for personal response preferences
- Optional web search with grounded answers
- Responsive portrait and landscape layouts

## Tech stack

- Next.js
- React
- TypeScript
- PixiJS 6
- `pixi-live2d-display` Cubism 4
- Supabase PostgreSQL
- External LLM, STT, and TTS providers

## Run locally

Clone the repository:

```bash
git clone https://github.com/celestial-sora/ai-waifu.git
cd ai-waifu
```

Install dependencies:

```bash
npm install
```

Create `.env.local` from `.env.example`, add the provider keys you want to use, then start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Custom expressions

Expressions can be triggered from the chat input:

```text
/expression list
/expression M love
/expression M wenhao
/expression default
```

Use `/exp` as a shorter alias.

## Project structure

```text
app/                  Next.js pages, UI, and API routes
lib/                  Models, companion state, tools, and Supabase helpers
public/live2d/Miss/   Miss Live2D model and expressions
supabase/migrations/  Database schema migrations
```

## Development notes

The project uses PixiJS 6 with the Cubism 4 runtime. The Miss model uses 4096×4096 source textures to remain compatible with mobile Safari and WebGL memory limits.

API keys belong in environment variables only. Never commit `.env.local` or expose provider keys in client-side code.

## Services used

<div align="center">

### Made with <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="heart"><path d="M20.8 8.8c0 5.2-8.8 10.3-8.8 10.3S3.2 14 3.2 8.8A4.8 4.8 0 0 1 12 6.1a4.8 4.8 0 0 1 8.8 2.7Z"/></svg>

This project uses the following external services:

- Vercel — deployment
- Supabase — database and memory storage
- Groq — language model inference
- ElevenLabs — speech-to-text
- Fish Audio — text-to-speech

</div>

Live2D Credit: Cai Cat

If you like the project, feel free to star the repository.
