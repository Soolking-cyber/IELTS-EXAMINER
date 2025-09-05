import type { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) return new Response(JSON.stringify({ error: 'Missing DEEPGRAM_API_KEY' }), { status: 500 });
    const r = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: { Authorization: `Token ${key}` },
      cache: 'no-store',
    });
    const txt = await r.text();
    let json: any = {};
    try { json = JSON.parse(txt || '{}'); } catch {}
    let access_token = json.access_token || json.token || '';
    if (!access_token && !r.ok) access_token = key; // fallback
    const payload = access_token ? { access_token, expires_at: json.expires_at || null } : (json || {});
    return new Response(JSON.stringify(payload), { status: access_token ? 200 : r.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Grant failed', detail: e?.message || String(e) }), { status: 500 });
  }
}

