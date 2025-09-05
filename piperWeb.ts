// Lightweight wrapper around Mintplex-Labs piper-tts-web via CDN
// Voice: en_GB-northern_english_male-medium (English, medium)

let piperMod: any | null = null;
const VOICE_ID = 'en_GB-northern_english_male-medium';
let preparing = false;
let prepared = false;

export async function ensurePiper(): Promise<void> {
  if (prepared || preparing) return;
  preparing = true;
  // Load ESM from jsDelivr to avoid bundling heavy assets
  // The library fetches voice/model files from Hugging Face CDN at runtime
  piperMod = await import(
    'https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web/dist/piper-tts-web.js'
  );
  try {
    // Pre-cache model (optional). Large download (~60MB); runs once per browser storage.
    await piperMod.download(VOICE_ID, () => {});
  } catch {}
  prepared = true;
  preparing = false;
}

export async function synthesizeToWavBlob(text: string): Promise<Blob> {
  if (!piperMod) await ensurePiper();
  return await piperMod.predict({ voiceId: VOICE_ID, text });
}

export async function speakWithPiper(
  text: string,
  audioCtx: AudioContext,
  outputNode: GainNode
): Promise<void> {
  if (!text || !text.trim()) return;
  await ensurePiper();
  const wav = await synthesizeToWavBlob(text);
  const arr = await wav.arrayBuffer();
  const buffer = await audioCtx.decodeAudioData(arr.slice(0));
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(outputNode);
  source.start();
  await new Promise<void>((resolve) => {
    source.onended = () => resolve();
  });
  try { source.disconnect(); } catch {}
}

