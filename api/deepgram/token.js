// Grants a short-lived Deepgram access token (JWT) for browser Live STT
// Uses the owner/project API key (server-side only)
const fetch = global.fetch || require('node-fetch');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) return res.status(500).json({ error: 'Missing DEEPGRAM_API_KEY' });
    const r = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: { Authorization: `Token ${key}` },
    });
    const bodyTxt = await r.text();
    try { res.setHeader('Content-Type', 'application/json'); } catch {}
    return res.status(r.status).send(bodyTxt || '{}');
  } catch (e) {
    return res.status(500).json({ error: 'Grant failed', detail: String(e && e.message || e) });
  }
}

