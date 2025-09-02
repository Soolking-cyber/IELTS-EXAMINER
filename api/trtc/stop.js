export const config = { runtime: 'nodejs', api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');
  try {
    const { TENCENT_SECRET_ID, TENCENT_SECRET_KEY, TENCENT_REGION } = process.env;
    // Graceful no-op if cloud API creds are not configured (avoid 500s on fallback path)
    if (!TENCENT_SECRET_ID || !TENCENT_SECRET_KEY) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).json({ ok: true, skipped: true, reason: 'missing_cloud_credentials' });
    }
    const region = TENCENT_REGION || 'ap-singapore';
    const tencentcloud = await import('tencentcloud-sdk-nodejs-trtc');
    const TrtcClient = tencentcloud.default?.trtc?.v20190722?.Client || tencentcloud.trtc.v20190722.Client;
    const client = new TrtcClient({
      credential: { secretId: TENCENT_SECRET_ID, secretKey: TENCENT_SECRET_KEY },
      region,
      profile: { httpProfile: { endpoint: 'trtc.tencentcloudapi.com' } },
    });
    const defaults = {
      SdkAppId: Number(process.env.TENCENT_SDK_APP_ID) || undefined,
      RoomId: Number(process.env.TENCENT_ROOM_ID) || undefined,
      UserId: process.env.TENCENT_USER_ID || undefined,
      AgentId: process.env.TENCENT_AGENT_ID || undefined,
    };
    const params = { ...defaults, ...(req.body || {}) };
    const data = await client.StopAIConversation(params);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(data);
  } catch (e) {
    console.error('TRTC StopAIConversation error', e);
    return res.status(500).json({ error: 'trtc_error', message: e?.message || String(e) });
  }
}
