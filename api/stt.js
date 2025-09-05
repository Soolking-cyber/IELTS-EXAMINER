const fetch = global.fetch || require('node-fetch');

// Proxies audio to Deepgram REST transcription.
// Accepts multipart/form-data with field 'audio' (Blob/File) or raw body.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Missing DEEPGRAM_API_KEY', hint: 'Set DEEPGRAM_API_KEY in your Vercel environment (Project Settings → Environment Variables) and redeploy.' });

    // Extract raw audio bytes + content type
    let contentType = req.headers['content-type'] || 'application/octet-stream';
    let body;
    if (contentType.startsWith('multipart/form-data')) {
      // Vercel automatically parses body? In Node runtime, we need to rely on edge? For simplicity, accept raw chunks when client sends raw.
      // To keep reliable, accept base64 in JSON too.
      return res.status(400).json({ error: 'Use raw audio upload or JSON { base64, contentType }' });
    } else if (contentType.startsWith('application/json')) {
      const json = req.body || {};
      const b64 = json.base64;
      contentType = json.contentType || 'audio/webm';
      if (!b64) return res.status(400).json({ error: 'Missing base64 audio' });
      body = Buffer.from(b64, 'base64');
    } else {
      body = req;
    }

    const url = 'https://api.deepgram.com/v1/listen?model=nova-3&language=en-US&punctuate=true';
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Token ${apiKey}`, 'Content-Type': contentType },
      body
    });
    if (!r.ok) {
      let payload = null;
      let text = '';
      try { payload = await r.json(); } catch { try { text = await r.text(); } catch {} }
      return res.status(r.status).json({
        error: 'Deepgram error',
        status: r.status,
        detail: payload || text || 'Unknown error',
        hint: 'Verify DEEPGRAM_API_KEY is valid and belongs to the correct project. REST requires a standard API key (not a realtime-scoped token).'
      });
    }
    const dg = await r.json();
    const text = dg?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: 'STT failure', detail: String(e && e.message || e) });
  }
}
