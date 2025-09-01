<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# IELTS Examiner — Dev and Vercel Deploy

This is a Vite web app that simulates an IELTS Speaking test. It uses:
- Google Gemini Flash Audio (live) for examiner voice prompts
- Web Speech API for on-device transcription
- Supabase (Google OAuth) and Postgres tables for question banks

## Local Development

Prerequisites: Node.js 18+ (or 20+), npm

1) Install deps
   `npm install`

2) Configure env in `.env.local`
   - `GEMINI_API_KEY=...`
   - `SUPABASE_URL=...`
   - `SUPABASE_ANON_KEY=...`

3) Supabase setup (one‑time)
   - Run your SQL files to create and populate:
     - `public.ielts_part1_questions`
     - `public.ielts_part2_cues`
     - `public.ielts_part3_questions`
   - Enable RLS read policies for anon/authenticated on all three tables.
   - Enable Google OAuth provider and add redirect: `http://localhost:5173`

4) Run dev server
   `npm run dev`
   Open http://localhost:5173

## Deploy to Vercel

Vercel detects Vite automatically. This repo includes `vercel.json`:
```
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm ci",
  "framework": "vite"
}
```

1) Create a Vercel project and link this repo.
2) Add Environment Variables (Project Settings → Environment Variables):
   - `GEMINI_API_KEY` (Production, Preview)
   - `SUPABASE_URL` (Production, Preview)
   - `SUPABASE_ANON_KEY` (Production, Preview)
3) Trigger a deployment. Vercel builds `dist/` and serves it statically.
4) In Supabase → Auth → Providers → Google, add your Vercel URL as a redirect:
   - `https://<your-project>.vercel.app`
   - And any custom domain you add later (e.g., `https://example.com`).

Notes
- The app makes client‑side connections to Google Gemini for live audio and to Supabase for reads; ensure your RLS policies allow SELECT for `anon` or `authenticated` as intended.
- Web Speech API (transcription) works best in Chrome and requires HTTPS (Vercel provides HTTPS by default).
