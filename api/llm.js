const fetch = global.fetch || require('node-fetch');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const body = req.body || {};
    const messages = Array.isArray(body.messages) ? body.messages : [{ role: 'user', content: String(body.prompt || '') }];
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI || process.env.OPENAI_PROJECT_API_KEY;
    const model = process.env.LLM_MODEL || 'gpt-4o-mini';
    if (!apiKey) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.3 })
    });
    if (!r.ok) {
      const err = await r.text().catch(() => '');
      return res.status(r.status).send(err || 'OpenAI error');
    }
    const json = await r.json();
    const text = json.choices?.[0]?.message?.content || '';
    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: 'LLM failure', detail: String(e && e.message || e) });
  }
}

