import 'dotenv/config';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OpenAI } from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.WS_PORT || process.env.PORT || 8787);
const SAMPLE_RATE = 16000;

// OpenAI client (LLM logic step)
const openaiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_PROJECT_API_KEY || process.env.OPENAI;
const LLM_MODEL = process.env.LLM_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

// Vosk ASR (optional, required for spec)
let voskAvailable = false;
let Vosk;
let voskModel;
try {
  // optional dependency; may fail if not installed
  Vosk = await import('vosk').then(m => m.default || m);
  const modelPath = process.env.VOSK_MODEL_PATH || path.join(__dirname, 'models', 'vosk-model-small-en-us-0.15');
  if (!fs.existsSync(modelPath)) {
    console.warn('[server] Vosk model not found at', modelPath);
  } else {
    Vosk.setLogLevel(0);
    voskModel = new Vosk.Model(modelPath);
    voskAvailable = true;
    console.log('[server] Vosk ready:', modelPath);
  }
} catch (e) {
  console.warn('[server] Vosk not available (install failed or missing).', e?.message || e);
}

// Piper TTS helper: spawn piper and stream WAV to buffer
function synthesizeWithPiper(text) {
  return new Promise((resolve, reject) => {
    const voice = process.env.PIPER_VOICE || process.env.PIPER_MODEL;
    if (!voice) return reject(new Error('PIPER_VOICE env not set (path to .onnx or voice dir)'));
    const args = ['-m', voice, '-f', '-']; // write WAV to stdout
    const p = spawn('piper', args);
    let chunks = [];
    let err = '';
    p.stdout.on('data', (d) => chunks.push(Buffer.from(d)));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', (e) => reject(e));
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`piper exited ${code}: ${err}`));
      resolve(Buffer.concat(chunks));
    });
    // Piper expects plain text line(s)
    p.stdin.write(text.replace(/\n+/g, ' ').trim() + '\n');
    p.stdin.end();
  });
}

// Simple IELTS logic with OpenAI
async function ieltsLogic(part, lastUserText) {
  const fallback = `Thanks. Please continue.`;
  if (!openai) return fallback;
  const role = part === 'part2' ? 'short monologue follow-up' : 'conversational prompt';
  const system = `You are an IELTS Speaking examiner. Respond in 1-2 concise sentences to keep the interview moving (${role}). Do not overexplain. Natural, neutral tone.`;
  const user = `Candidate said: "${lastUserText}". Respond briefly as examiner.`;
  try {
    const resp = await openai.chat.completions.create({
      model: LLM_MODEL,
      temperature: 0.5,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    });
    const text = resp.choices?.[0]?.message?.content?.trim();
    return text || fallback;
  } catch (e) {
    console.warn('[server] OpenAI error', e?.message || e);
    return fallback;
  }
}

function pcm16leToFloat32(int16) {
  const out = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) out[i] = Math.max(-1, int16[i] / 32768);
  return out;
}

const wss = new WebSocketServer({ port: PORT });
console.log(`[server] WS listening on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  console.log('[server] client connected');
  let recognizer = null;
  let lastPartialAt = 0;
  let part = 'part1';
  let closed = false;
  let lastFinalText = '';

  function sendJson(obj) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  }

  ws.on('message', async (data, isBinary) => {
    if (closed) return;
    try {
      if (!isBinary) {
        const msg = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : data);
        if (msg.type === 'start') {
          part = msg.session?.part || 'part1';
          if (voskAvailable) {
            recognizer = new Vosk.Recognizer({ model: voskModel, sampleRate: SAMPLE_RATE });
          } else {
            recognizer = null;
          }
          sendJson({ type: 'ready', asr: !!recognizer, tts: true, llm: !!openai });
        } else if (msg.type === 'say' && typeof msg.text === 'string' && msg.text.trim()) {
          // One-off TTS for client prompts
          try {
            const wav = await synthesizeWithPiper(String(msg.text));
            sendJson({ type: 'tts_start', sampleRate: 22050 });
            const CHUNK = 32 * 1024;
            for (let i = 0; i < wav.length; i += CHUNK) {
              ws.send(wav.subarray(i, Math.min(i + CHUNK, wav.length)));
            }
            sendJson({ type: 'tts_end' });
          } catch (e) {
            sendJson({ type: 'error', error: 'piper_failed', detail: e?.message || String(e) });
          }
        } else if (msg.type === 'stop') {
          // finalize ASR
          let finalText = lastFinalText;
          if (recognizer) {
            try {
              const res = recognizer.finalResult();
              finalText = (res?.text || '').trim() || finalText;
            } catch {}
            try { recognizer.free(); } catch {}
          }
          if (finalText) sendJson({ type: 'stt_final', text: finalText });

          // logic → TTS
          const reply = await ieltsLogic(part, finalText || '');
          sendJson({ type: 'llm', text: reply });
          try {
            const wav = await synthesizeWithPiper(reply);
            // stream in chunks (~32KB)
            sendJson({ type: 'tts_start', sampleRate: 22050 });
            const CHUNK = 32 * 1024;
            for (let i = 0; i < wav.length; i += CHUNK) {
              ws.send(wav.subarray(i, Math.min(i + CHUNK, wav.length)));
            }
            sendJson({ type: 'tts_end' });
          } catch (e) {
            sendJson({ type: 'error', error: 'piper_failed', detail: e?.message || String(e) });
          }
        }
        return;
      }
      // Binary: expect Int16LE PCM mono @ 16kHz
      if (recognizer) {
        const buf = Buffer.from(data);
        const int16 = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
        // Vosk expects Float32? Vosk node accepts Int16 array via acceptWaveform
        const ok = recognizer.acceptWaveform(int16);
        const now = Date.now();
        if (ok) {
          const res = recognizer.result();
          const text = (res?.text || '').trim();
          if (text) {
            lastFinalText = text;
            sendJson({ type: 'stt', partial: text, final: true });
          }
        } else if (now - lastPartialAt > 350) {
          const partial = recognizer.partialResult();
          const pt = (partial?.partial || '').trim();
          if (pt) sendJson({ type: 'stt', partial: pt });
          lastPartialAt = now;
        }
      }
    } catch (e) {
      sendJson({ type: 'error', error: 'bad_message', detail: e?.message || String(e) });
    }
  });

  ws.on('close', () => {
    closed = true;
    try { recognizer?.free?.(); } catch {}
  });
});
