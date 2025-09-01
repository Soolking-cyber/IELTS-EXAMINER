export const config = {
  api: { bodyParser: true },
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');
  try {
    const base = process.env.TTS_URL || process.env.UNMUTE_URL || process.env.LLM_URL?.replace(/\/llm.*$/, '')?.replace(/\/$/, '') || '';
    if (!base) return res.status(500).json({ error: 'TTS_URL/UNMUTE_URL not configured' });
    const upstream = await fetch(`${base}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'upstream_error', body: text.slice(0, 500) });
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.status(200).send(text);
  } catch (e) {
    console.error('TTS proxy error', e);
    return res.status(500).json({ error: 'TTS proxy error' });
  }
}

