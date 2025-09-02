export const config = { runtime: 'nodejs', api: { bodyParser: true } };

import crypto from 'crypto';
import { Buffer } from 'buffer';
import zlib from 'zlib';

// LibGenerateTestUserSig equivalent implementation
class LibGenerateTestUserSig {
  constructor(sdkAppId, secretKey, expireTime) {
    this.sdkAppId = sdkAppId;
    this.secretKey = secretKey;
    this.expireTime = expireTime;
  }

  genTestUserSig(userId) {
    const current = Math.floor(Date.now() / 1000);
    const expire = this.expireTime;

    // Create signature content exactly like Tencent's client library
    const contentToBeSigned =
      'TLS.identifier:' + userId + '\n' +
      'TLS.sdkappid:' + this.sdkAppId + '\n' +
      'TLS.time:' + current + '\n' +
      'TLS.expire:' + expire + '\n';

    // HMAC-SHA256 signature
    const hmac = crypto.createHmac('sha256', this.secretKey);
    hmac.update(contentToBeSigned, 'utf8');
    const signature = hmac.digest('base64');

    // Create the signature document
    const sigDoc = {
      'TLS.ver': '2.0',
      'TLS.sdkappid': parseInt(this.sdkAppId),
      'TLS.identifier': userId,
      'TLS.expire': parseInt(expire),
      'TLS.time': current,
      'TLS.sig': signature
    };

    // Compress and encode like the original library
    const jsonStr = JSON.stringify(sigDoc);
    const compressed = zlib.deflateSync(Buffer.from(jsonStr, 'utf8'));

    return compressed.toString('base64')
      .replace(/\+/g, '*')
      .replace(/\//g, '-')
      .replace(/=/g, '_');
  }
}

// Main function matching your format exactly
function genTestUserSig({ sdkAppId, userId, sdkSecretKey }) {
  const SDKAPPID = sdkAppId;
  const EXPIRETIME = 604800; // 7 days like in your example
  const SDKSECRETKEY = sdkSecretKey;

  // Create generator instance
  const generator = new LibGenerateTestUserSig(SDKAPPID, SDKSECRETKEY, EXPIRETIME);
  const userSig = generator.genTestUserSig(userId);

  return {
    sdkAppId: SDKAPPID,
    userSig: userSig
  };
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

    // Use the exact format from your client-side code
    const result = genTestUserSig({
      sdkAppId: sdkAppId,
      userId: String(userId),
      sdkSecretKey: secretKey
    });
    const userSig = result.userSig;

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
