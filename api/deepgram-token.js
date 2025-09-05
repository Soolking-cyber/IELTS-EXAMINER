const fetch = global.fetch || require('node-fetch');

// Issues a short-lived Deepgram key for browser Realtime use.
// Requires env: DEEPGRAM_API_KEY and DEEPGRAM_PROJECT_ID
// TTL defaults to 600 seconds.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const key = process.env.DEEPGRAM_API_KEY;
    const ttl = Math.max(60, Math.min(3600, Number(process.env.DEEPGRAM_TOKEN_TTL || 600)));
    if (!key) return res.status(500).json({ error: 'Missing DEEPGRAM_API_KEY' });
    // Resolve project if not provided
    let project = process.env.DEEPGRAM_PROJECT_ID;
    if (!project) {
      const pr = await fetch('https://api.deepgram.com/v1/projects', { headers: { 'Authorization': `Token ${key}` } });
      if (!pr.ok) return res.status(pr.status).json({ error: 'Failed to list projects', detail: await pr.text().catch(()=> '') });
      const pj = await pr.json();
      const first = Array.isArray(pj?.projects) && pj.projects[0];
      if (!first?.project_id) return res.status(500).json({ error: 'No projects available for this key' });
      project = first.project_id;
    }
    const r = await fetch(`https://api.deepgram.com/v1/projects/${project}/keys`, {
      method: 'POST',
      headers: { 'Authorization': `Token ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comment: 'browser-realtime-temp',
        time_to_live_in_seconds: ttl,
        scopes: [
          // Scopes for realtime WS (read audio + transcripts)
          'listen:read',
          'listen:write'
        ]
      })
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return res.status(r.status).send(txt || 'Failed to mint Deepgram token');
    }
    const json = await r.json();
    // Deepgram returns the new key; return it directly to the client
    res.status(200).json({ token: json.key?.key || json.key || json?.api_key || '' });
  } catch (e) {
    res.status(500).json({ error: 'Deepgram token failure', detail: String(e && e.message || e) });
  }
}
