// Lightweight wrapper around Mintplex-Labs piper-tts-web via CDN
// Voice: en_GB-northern_english_male-medium (English, medium)

let piperMod: any | null = null;
export const VOICE_ID = 'en_GB-northern_english_male-medium';
let preparing = false;
let prepared = false;

export type PiperProgress = (p: { url?: string; total?: number; loaded?: number }) => void;

export async function preparePiper(onProgress?: PiperProgress): Promise<void> {
  if (prepared) return;
  if (!preparing) {
    preparing = true;
    piperMod = await import('https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web/dist/piper-tts-web.js');
    try {
      await piperMod.download(VOICE_ID, onProgress);
    } catch {}
    prepared = true;
    preparing = false;
  }
  // If a second caller arrives while preparing, just await a tiny tick
  while (!prepared) {
    await new Promise(r => setTimeout(r, 50));
  }
}

export async function synthesizeToWavBlob(text: string): Promise<Blob> {
  if (!piperMod) await preparePiper();
  return await piperMod.predict({ voiceId: VOICE_ID, text });
}

export async function speakWithPiper(
  text: string,
  audioCtx: AudioContext,
  outputNode: GainNode
): Promise<void> {
  if (!text || !text.trim()) return;
  await preparePiper();
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
