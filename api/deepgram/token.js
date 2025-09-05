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
    const txt = await r.text();
    let json;
    try { json = JSON.parse(txt || '{}'); } catch { json = {}; }
    // Normalize to { access_token }
    let access_token = json.access_token || json.token || '';
    // Fallback: if grant fails or returns no token, use API key directly (requested behavior)
    if (!access_token && !r.ok) access_token = key;
    const payload = access_token ? { access_token, expires_at: json.expires_at || null } : (json || {});
    res.setHeader('Content-Type', 'application/json');
    return res.status(access_token ? 200 : r.status).send(JSON.stringify(payload));
  } catch (e) {
    return res.status(500).json({ error: 'Grant failed', detail: String(e && e.message || e) });
  }
}
