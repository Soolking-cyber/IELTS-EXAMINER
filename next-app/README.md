# IELTS Examiner — Next.js Edition

This Next.js app hosts the existing Lit-based UI and provides server routes for Deepgram and OpenAI. Styling uses Tailwind CSS.

## Setup

Env variables (in `.env.local` here):
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_SITE_URL (your deploy URL)
- NEXT_PUBLIC_DEEPGRAM_FRONTEND_TOKEN (optional for local dev without grant)
- DEEPGRAM_API_KEY (server-side for `/api/deepgram/token`)
- OPENAI_API_KEY (server-side for `/api/llm`)

## Scripts
- `npm run dev` — run Next.js dev on port 5174
- `npm run build` / `npm run start`

## Notes
- The existing UI component is reused with minimal changes via webpack defines in `next.config.js` that map NEXT_PUBLIC_* variables to the keys it expects.
- Deepgram token endpoint: `/api/deepgram/token`
- OpenAI LLM endpoint: `/api/llm`

