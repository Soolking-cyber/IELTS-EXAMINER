const fetch = global.fetch || require('node-fetch');
const { createClient } = require('@deepgram/sdk');

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

    const json = req.body || {};
    const urlInput = json.url;
    const b64 = json.base64;
    const contentType = (json.contentType || '').split(';')[0] || 'audio/webm';

    const deepgram = createClient(apiKey);
    let result, error;
    if (urlInput) {
      ({ result, error } = await deepgram.listen.prerecorded.transcribeUrl(
        { url: urlInput },
        { model: 'nova-3', smart_format: true, language: 'en-US' }
      ));
    } else if (b64) {
      const buffer = Buffer.from(b64, 'base64');
      ({ result, error } = await deepgram.listen.prerecorded.transcribeFile(
        { buffer, mimetype: contentType },
        { model: 'nova-3', smart_format: true, language: 'en-US' }
      ));
    } else {
      return res.status(400).json({ error: 'Missing input', detail: 'Provide { url } or { base64, contentType }' });
    }
    if (error) {
      return res.status(502).json({ error: 'Deepgram error', detail: error });
    }
    const text = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: 'STT failure', detail: String(e && e.message || e) });
  }
}
