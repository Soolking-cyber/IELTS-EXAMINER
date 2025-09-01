export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  try {
    console.log('[/api/stt] hit', {
      method: req.method,
      origin: req.headers?.origin,
      contentType: req.headers?.['content-type'],
    });
  } catch {}
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const sttBase = process.env.UNMUTE_URL || process.env.STT_URL;
    if (!sttBase) return res.status(500).json({ error: 'UNMUTE_URL/STT_URL not configured' });
    const url = new URL(req.url, 'http://localhost');
    const qs = url.search || '';

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    try { console.log('[/api/stt] body length', body.length); } catch {}

    const upstream = await fetch(`${sttBase.replace(/\/$/, '')}/stt${qs}`, {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/octet-stream',
      },
      body,
    });
    const text = await upstream.text();
    const ct = upstream.headers.get('content-type') || 'application/json';
    if (!upstream.ok) {
      try { console.error('[/api/stt] upstream error', upstream.status, text.slice(0, 500)); } catch {}
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');
      return res.status(upstream.status).json({ error: 'upstream_error', status: upstream.status, body: text.slice(0, 500) });
    }
    res.setHeader('Content-Type', ct);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(upstream.status).send(text);
  } catch (e) {
    console.error('STT proxy error', e);
    return res.status(500).json({ error: 'STT proxy error' });
  }
}
