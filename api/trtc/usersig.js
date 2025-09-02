export const config = { runtime: 'nodejs', api: { bodyParser: true } };

import crypto from 'crypto';
import { Buffer } from 'buffer';
import zlib from 'zlib';

// Tencent's official UserSig generation algorithm (HMAC-SHA256)
function genUserSig(sdkAppId, secretKey, userId, expire = 86400) {
  const current = Math.floor(Date.now() / 1000);
  
  // Create the content to be signed
  const contentToBeSigned = 
    'TLS.identifier:' + userId + '\n' +
    'TLS.sdkappid:' + sdkAppId + '\n' +
    'TLS.time:' + current + '\n' +
    'TLS.expire:' + expire + '\n';

  // Calculate HMAC-SHA256 signature
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(contentToBeSigned, 'utf8');
  const signature = hmac.digest('base64');

  // Create the UserSig object
  const userSigDoc = {
    'TLS.ver': '2.0',
    'TLS.sdkappid': parseInt(sdkAppId),
    'TLS.identifier': userId,
    'TLS.expire': parseInt(expire),
    'TLS.time': current,
    'TLS.sig': signature
  };

  // Convert to JSON and compress with zlib (Tencent's format)
  const jsonStr = JSON.stringify(userSigDoc);
  const compressed = zlib.deflateSync(Buffer.from(jsonStr, 'utf8'));
  
  // Base64 encode and make URL-safe
  return compressed.toString('base64')
    .replace(/\+/g, '*')
    .replace(/\//g, '-')
    .replace(/=/g, '_');
}

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
    
    // Use Tencent's official HMAC-SHA256 algorithm
    const userSig = genUserSig(sdkAppId, secretKey, String(userId), Number(expire));
    
    // Debug logging (remove in production)
    console.log('UserSig generation:', {
      sdkAppId,
      userId: String(userId),
      expire: Number(expire),
      secretKeyLength: secretKey.length,
      userSigLength: userSig.length,
      method: 'tencent-hmac-sha256',
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
