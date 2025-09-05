IELTS Audio WS Server

Pipeline: mic → WS → Vosk → logic (OpenAI) → Piper → stream back

Run locally

- Requirements:
  - Node.js 18+
  - Piper CLI installed (`piper` in PATH) and a voice model file
  - Vosk Node module (optional but recommended) and a model directory

- Env vars:
  - `OPENAI_API_KEY`: OpenAI key (project key supported)
  - `LLM_MODEL`: OpenAI model (default: `gpt-4o-mini`). If you intend to use a custom name like "GPT 5 NANO", set it here; the API must accept it.
  - `WS_PORT`: WebSocket port (default 8787)
  - `VOSK_MODEL_PATH`: Path to a Vosk model directory (e.g., `server/models/vosk-model-small-en-us-0.15`)
  - `PIPER_VOICE`: Path to a Piper voice model (e.g., `en_US-lessac-medium.onnx`)

- Install and start:
  - `npm install --prefix server`
  - `npm run server`

Client config

- Set `WS_URL` in `.env.local` (e.g., `WS_URL=ws://localhost:8787`). Vite injects this at build time.

Notes

- If Vosk is not installed or a model is missing, ASR falls back to no-op and only TTS is performed after `stop`.
- Piper streams back a single WAV per response; the client plays it upon `tts_end`.

