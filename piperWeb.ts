// Lightweight wrapper around Mintplex-Labs piper-tts-web via CDN
// Voice: en_GB-northern_english_male-medium (English, medium)

let piperMod: any | null = null;
export const VOICE_ID = 'en_GB-northern_english_male-medium';
let loadingModule = false;
let moduleReady = false;

export type PiperProgress = (p: { url?: string; total?: number; loaded?: number }) => void;

async function loadModuleOnce() {
  if (moduleReady) return;
  if (!loadingModule) {
    loadingModule = true;
    piperMod = await import('https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web/dist/piper-tts-web.js');
    moduleReady = true;
    loadingModule = false;
  }
  while (!moduleReady) await new Promise(r => setTimeout(r, 20));
}

export async function isVoiceCached(): Promise<boolean> {
  await loadModuleOnce();
  try {
    const stored: string[] = await piperMod.stored();
    return Array.isArray(stored) && stored.includes(VOICE_ID);
  } catch { return false; }
}

export async function preparePiper(onProgress?: PiperProgress): Promise<void> {
  await loadModuleOnce();
  const cached = await isVoiceCached();
  if (!cached) {
    try { await piperMod.download(VOICE_ID, onProgress); } catch {}
  }
}

export async function clearVoiceCache(): Promise<void> {
  await loadModuleOnce();
  try { await piperMod.remove(VOICE_ID); } catch {}
}

export async function synthesizeToWavBlob(text: string): Promise<Blob> {
  await loadModuleOnce();
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
