export const config = { runtime: 'nodejs', api: { bodyParser: true } };

import crypto from 'crypto';
import { Buffer } from 'buffer';

// Native implementation of UserSig generation
function genUserSig(sdkAppId, secretKey, userId, expire = 86400) {
  const current = Math.floor(Date.now() / 1000);
  const sig = {
    'TLS.ver': '2.0',
    'TLS.sdkappid': sdkAppId,
    'TLS.identifier': userId,
    'TLS.expire': expire,
    'TLS.time': current,
    'TLS.sig': ''
  };

  const sigStr = 
    'TLS.identifier:' + sig['TLS.identifier'] + '\n' +
    'TLS.sdkappid:' + sig['TLS.sdkappid'] + '\n' +
    'TLS.time:' + sig['TLS.time'] + '\n' +
    'TLS.expire:' + sig['TLS.expire'] + '\n';

  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(sigStr);
  sig['TLS.sig'] = hmac.digest('base64');

  const sigDoc = JSON.stringify(sig);
  const compressed = Buffer.from(sigDoc).toString('base64');
  return compressed.replace(/\+/g, '*').replace(/\//g, '-').replace(/=/g, '_');
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
    const secretKey = process.env.TENCENT_SECRET_KEY;
    if (!sdkAppId || !secretKey) {
      return res.status(500).json({ error: 'Missing TENCENT_SDK_APP_ID or TENCENT_SECRET_KEY' });
    }
    const { userId, expire = 86400 } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    
    const userSig = genUserSig(sdkAppId, secretKey, String(userId), Number(expire));
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ sdkAppId, userId, userSig, expire });
  } catch (e) {
    console.error('TRTC UserSig error', e);
    return res.status(500).json({ error: 'usersig_error', message: e?.message || String(e) });
  }
}
