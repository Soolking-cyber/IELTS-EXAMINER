export const config = { runtime: 'nodejs', api: { bodyParser: true } };

import crypto from 'crypto';
import { Buffer } from 'buffer';

// Import the official TLS-SIG-API-V2 library
import TLSSigAPIv2 from 'tls-sig-api-v2';

// Using official TLS-SIG-API-V2 library - no manual implementation needed

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');
  try {
    const sdkAppId = Number(process.env.TENCENT_SDK_APP_ID);
    const secretKey = process.env.TENCENT_SDK_SECRET_KEY || process.env.TENCENT_SECRET_KEY;
    if (!sdkAppId || !secretKey) {
      return res.status(500).json({ error: 'Missing TENCENT_SDK_APP_ID or TENCENT_SDK_SECRET_KEY' });
    }
    const { userId, expire = 86400 } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    
    // Use official TLS-SIG-API-V2 library (this is the correct way)
    const api = new TLSSigAPIv2.Api(sdkAppId, secretKey);
    const userSig = api.genUserSig(String(userId), Number(expire));
    
    // Debug logging (remove in production)
    console.log('UserSig generation:', {
      sdkAppId,
      userId: String(userId),
      expire: Number(expire),
      secretKeyLength: secretKey.length,
      userSigLength: userSig.length,
      method: 'official-tls-sig-api-v2',
      secretKeyPrefix: secretKey.substring(0, 8),
      secretKeySuffix: secretKey.substring(secretKey.length - 8)
    });
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ sdkAppId, userId, userSig, expire });
  } catch (e) {
    console.error('TRTC UserSig error', e);
    return res.status(500).json({ error: 'usersig_error', message: e?.message || String(e) });
  }
}
