module.exports.config = { runtime: 'nodejs', api: { bodyParser: true } };
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');
  try {
    const { TENCENT_SECRET_ID, TENCENT_SECRET_KEY, TENCENT_REGION, TRTC_BACKEND_URL } = process.env;
    const defaults = {
      SdkAppId: Number(process.env.TENCENT_SDK_APP_ID) || undefined,
      RoomId: Number(process.env.TENCENT_ROOM_ID) || undefined,
      UserId: process.env.TENCENT_USER_ID || undefined,
      AgentId: process.env.TENCENT_AGENT_ID || undefined,
    };
    const params = { ...defaults, ...(req.body || {}) };
    if (params.RoomId != null) params.RoomId = String(params.RoomId);

    const backend = (TRTC_BACKEND_URL || '').trim();
    if (backend) {
      const r = await fetch(`${backend.replace(/\/$/, '')}/stop-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await r.json();
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(r.ok ? 200 : 500).json(data);
    }

    if (!TENCENT_SECRET_ID || !TENCENT_SECRET_KEY) {
      return res.status(500).json({ error: 'missing_cloud_credentials' });
    }
    const region = TENCENT_REGION || 'ap-singapore';
    const tencentcloud = require('tencentcloud-sdk-nodejs-trtc');
    const TrtcClient = tencentcloud.trtc.v20190722.Client;
    const client = new TrtcClient({
      credential: { secretId: TENCENT_SECRET_ID, secretKey: TENCENT_SECRET_KEY },
      region,
      profile: { httpProfile: { endpoint: 'trtc.tencentcloudapi.com' } },
    });
    const data = await client.StopAIConversation(params);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(data);
  } catch (e) {
    const detail = {
      name: e?.name,
      code: e?.code,
      message: e?.message || String(e),
      requestId: e?.requestId || e?.RequestId,
    };
    console.error('TRTC StopAIConversation error', detail);
    return res.status(500).json({ error: 'trtc_error', ...detail });
  }
}

module.exports = handler;
