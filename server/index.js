import 'dotenv/config';
import { WebSocketServer } from 'ws';
import http from 'http';
import { spawn } from 'child_process';
import { createClient } from '@deepgram/sdk';
import { OpenAI } from 'openai';

const PORT = Number(process.env.WS_PORT || process.env.PORT || 8787);

// OpenAI client (LLM logic step)
const openaiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_PROJECT_API_KEY || process.env.OPENAI;
const LLM_MODEL = process.env.LLM_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

// Deepgram ASR setup
const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
const deepgramAvailable = !!deepgramApiKey;
if (deepgramAvailable) {
  console.log('[server] Deepgram ready');
} else {
  console.warn('[server] Deepgram not available - DEEPGRAM_API_KEY not set');
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



const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    res.end(JSON.stringify({ ok: true, deepgram: !!deepgramAvailable, llm: !!openai }));
  } else if (req.url === '/version') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ielts-audio-server 0.1.0');
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});
const wss = new WebSocketServer({ server });
server.listen(PORT, () => {
  console.log(`[server] WS listening on ws://0.0.0.0:${PORT}`);
});

wss.on('connection', (ws) => {
  console.log('[server] client connected');
  let deepgramConnection = null;
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
          
          // Initialize Deepgram connection
          if (deepgramAvailable) {
            try {
              const deepgram = createClient(deepgramApiKey);
              deepgramConnection = deepgram.listen.live({
                model: 'nova-3',
                language: 'en',
                smart_format: true,
                punctuate: true,
                interim_results: true,
                vad_events: true,
                endpointing: '1000',
                encoding: 'linear16',
                sample_rate: 16000,
                channels: 1
              });

              deepgramConnection.on('open', () => {
                console.log('[server] Deepgram connection opened');
              });

              deepgramConnection.on('transcript', (data) => {
                const alt = data?.channel?.alternatives?.[0];
                if (!alt) return;
                const text = (alt.transcript || '').trim();
                if (!text) return;

                if (data.is_final) {
                  lastFinalText = text;
                  sendJson({ type: 'stt', partial: text, final: true });
                } else {
                  sendJson({ type: 'stt', partial: text, final: false });
                }
              });

              deepgramConnection.on('error', (error) => {
                console.error('[server] Deepgram error:', error);
                sendJson({ type: 'error', error: 'deepgram_error', detail: error?.message || String(error) });
              });

              deepgramConnection.on('close', () => {
                console.log('[server] Deepgram connection closed');
              });

            } catch (e) {
              console.error('[server] Failed to initialize Deepgram:', e);
              deepgramConnection = null;
            }
          }
          
          sendJson({ type: 'ready', asr: !!deepgramConnection, tts: true, llm: !!openai });
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
          // Close Deepgram connection and finalize
          if (deepgramConnection) {
            try {
              deepgramConnection.close();
            } catch {}
            deepgramConnection = null;
          }
          
          if (lastFinalText) sendJson({ type: 'stt_final', text: lastFinalText });

          // logic only; client handles TTS via browser Piper
          const reply = await ieltsLogic(part, lastFinalText || '');
          sendJson({ type: 'llm', text: reply });
        }
        return;
      }
      
      // Binary: expect Int16LE PCM mono @ 16kHz - send to Deepgram
      if (deepgramConnection && deepgramConnection.getReadyState() === 1) {
        try {
          deepgramConnection.send(data);
        } catch (e) {
          console.error('[server] Failed to send audio to Deepgram:', e);
        }
      }
    } catch (e) {
      sendJson({ type: 'error', error: 'bad_message', detail: e?.message || String(e) });
    }
  });

  ws.on('close', () => {
    closed = true;
    if (deepgramConnection) {
      try { deepgramConnection.close(); } catch {}
      deepgramConnection = null;
    }
  });
});
