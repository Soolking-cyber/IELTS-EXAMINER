import type { NextRequest } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_STUDIO || '';
    if (!apiKey) return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY' }), { status: 500 });
    const { messages } = await req.json();
    const client = new OpenAI({ apiKey });
    const r = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: (messages || []).map((m: any) => ({ role: m.role, content: m.content })),
      temperature: 0.3,
      max_tokens: 200,
    });
    const text = r.choices?.[0]?.message?.content || '';
    return new Response(JSON.stringify({ text }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'LLM failure', detail: e?.message || String(e) }), { status: 500 });
  }
}

