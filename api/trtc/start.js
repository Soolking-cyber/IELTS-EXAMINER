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
    const { TENCENT_SECRET_ID, TENCENT_SECRET_KEY, TENCENT_REGION, TENCENT_SDK_APP_ID, TENCENT_SDK_SECRET_KEY, TENCENT_AGENT_ID } = process.env;
    try {
      console.log('TRTC start env:', {
        sidLen: (TENCENT_SECRET_ID || '').length,
        skLen: (TENCENT_SECRET_KEY || '').length,
        sdkId: TENCENT_SDK_APP_ID ? Number(TENCENT_SDK_APP_ID) : null,
        region: TENCENT_REGION || null
      });
    } catch {}
    // We proxy to the dedicated local Tencent server instead of calling the SDK here
    const defaults = {
      SdkAppId: Number(TENCENT_SDK_APP_ID) || undefined,
      RoomId: Number(process.env.TENCENT_ROOM_ID) || undefined,
      UserId: process.env.TENCENT_USER_ID || undefined,
      AgentId: TENCENT_AGENT_ID || undefined,
    };
    const input = (req.body || {});
    const params = { ...defaults, ...input };
    if (params.RoomId != null) params.RoomId = String(params.RoomId);
    // Move client userId into AgentConfig.TargetUserId as expected by TRTC API
    if (params.UserId) {
      params.AgentConfig = params.AgentConfig || {};
      params.AgentConfig.TargetUserId = String(params.UserId);
      delete params.UserId;
    }
    // Remove AgentId in favor of AgentConfig.UserId
    if (params.AgentId) delete params.AgentId;

    // Ensure SdkAppId present
    if (!params.SdkAppId && TENCENT_SDK_APP_ID) params.SdkAppId = Number(TENCENT_SDK_APP_ID);

    // Attach AgentConfig with robot UserSig if SDK secret available
    if (TENCENT_SDK_APP_ID && TENCENT_SDK_SECRET_KEY) {
      const sdkAppIdNum = Number(TENCENT_SDK_APP_ID);
      const secretKey = TENCENT_SDK_SECRET_KEY;
      const agentUserId = String(params.AgentId || TENCENT_AGENT_ID || 'robot_id');

      const { createHmac } = require('crypto');
      const { deflateSync } = require('zlib');
      const esc = (s) => s.replace(/\+/g, '*').replace(/\//g, '-').replace(/=/g, '_');
      const genUserSig = (userId, expireSec = 86400) => {
        const now = Math.floor(Date.now() / 1000);
        const doc = {
          'TLS.ver': '2.0',
          'TLS.identifier': String(userId),
          'TLS.sdkappid': Number(sdkAppIdNum),
          'TLS.time': Number(now),
          'TLS.expire': Number(expireSec),
        };
        const content = `TLS.identifier:${userId}\nTLS.sdkappid:${sdkAppIdNum}\nTLS.time:${now}\nTLS.expire:${expireSec}\n`;
        const sig = createHmac('sha256', secretKey).update(content).digest('base64');
        doc['TLS.sig'] = sig;
        return esc(deflateSync(Buffer.from(JSON.stringify(doc))).toString('base64'));
      };

      const robotSig = genUserSig(agentUserId, 86400);
      params.AgentConfig = {
        ...(params.AgentConfig || {}),
        UserId: agentUserId,
        UserSig: robotSig,
        WelcomeMessage: params.AgentConfig?.WelcomeMessage || 'Welcome to IELTS Speaking Test!',
        InterruptMode: params.AgentConfig?.InterruptMode ?? 0,
        InterruptSpeechDuration: params.AgentConfig?.InterruptSpeechDuration ?? 1000,
      };
    }

    // Ensure STT/LLM/TTS configs when missing (server-side assembly) using env only
    const dgKey = process.env.DEEPGRAM_API_KEY;
    if (!params.STTConfig && dgKey) {
      params.STTConfig = {
        Language: 'en',
        VadSilenceTime: 1000,
        CustomParam: JSON.stringify({ STTType: 'deepgram', Model: 'nova-3', ApiKey: dgKey })
      };
    }
    if (params.LLMConfig && typeof params.LLMConfig !== 'string') params.LLMConfig = JSON.stringify(params.LLMConfig);
    if (!params.LLMConfig && process.env.OPENAI_API_KEY) {
      params.LLMConfig = JSON.stringify({ LLMType: 'openai', Model: 'gpt-4o-mini', APIUrl: 'https://api.openai.com/v1/chat/completions', APIKey: process.env.OPENAI_API_KEY, History: 5, Timeout: 10, Streaming: true });
    }
    if (params.TTSConfig && typeof params.TTSConfig !== 'string') params.TTSConfig = JSON.stringify(params.TTSConfig);
    if (!params.TTSConfig && process.env.CARTESIA_API_KEY) {
      params.TTSConfig = JSON.stringify({ TTSType: 'cartesia', Model: 'sonic-english', APIKey: process.env.CARTESIA_API_KEY, VoiceId: 'e8e5fffb-252c-436d-b842-8879b84445b6' });
    }

    const backend = (process.env.TRTC_BACKEND_URL || '').trim();
    if (backend) {
      const r = await fetch(`${backend.replace(/\/$/, '')}/start-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await r.json();
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(r.ok ? 200 : 500).json(data);
    }

    // Direct Tencent SDK call (production path)
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
    const data = await client.StartAIConversation(params);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(data);
  } catch (e) {
    const detail = {
      name: e?.name,
      code: e?.code,
      message: e?.message || String(e),
      requestId: e?.requestId || e?.RequestId,
    };
    console.error('TRTC StartAIConversation error', detail);
    return res.status(500).json({ error: 'trtc_error', ...detail });
  }
}

module.exports = handler;
