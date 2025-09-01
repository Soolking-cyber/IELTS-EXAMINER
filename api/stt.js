export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
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
    const sttBase = process.env.STT_URL;
    if (!sttBase) return res.status(500).json({ error: 'STT_URL not configured' });
    const url = new URL(req.url, 'http://localhost');
    const qs = url.search || '';

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    const upstream = await fetch(`${sttBase.replace(/\/$/, '')}/stt${qs}`, {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/octet-stream',
      },
      body,
    });

    const text = await upstream.text();
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(upstream.status).send(text);
  } catch (e) {
    console.error('STT proxy error', e);
    return res.status(500).json({ error: 'STT proxy error' });
  }
}

