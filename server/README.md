IELTS Audio WS Server

Pipeline: mic → WS → Deepgram → logic (OpenAI) → Piper → stream back

Run locally

- Requirements:
  - Node.js 18+
  - Piper CLI installed (`piper` in PATH) and a voice model file
  - Deepgram API key for speech recognition

- Env vars:
  - `OPENAI_API_KEY`: OpenAI key (project key supported)
  - `LLM_MODEL`: OpenAI model (default: `gpt-4o-mini`). If you intend to use a custom name like "GPT 5 NANO", set it here; the API must accept it.
  - `WS_PORT`: WebSocket port (default 8787)
  - `DEEPGRAM_API_KEY`: Deepgram API key for speech recognition
  - `PIPER_VOICE`: Path to a Piper voice model (e.g., `en_US-lessac-medium.onnx`)

- Install and start:
  - `npm install --prefix server`
  - `npm run server`

Client config

- Set `WS_URL` in `.env.local` (e.g., `WS_URL=ws://localhost:8787`). Vite injects this at build time.

Notes

- If Deepgram API key is not set, ASR falls back to no-op and only TTS is performed after `stop`.
- Piper streams back a single WAV per response; the client plays it upon `tts_end`.

