export const config = { runtime: 'nodejs', api: { bodyParser: true } };

import crypto from 'crypto';
import { Buffer } from 'buffer';

// Try to use the official TLS-SIG-API-V2 library if available
let TLSSigAPIv2;
try {
  TLSSigAPIv2 = require('tls-sig-api-v2');
} catch (e) {
  console.log('TLS-SIG-API-V2 not available, using manual implementation');
}

// Correct UserSig generation following Tencent's official algorithm
function genUserSig(sdkAppId, secretKey, userId, expire = 86400) {
  const current = Math.floor(Date.now() / 1000);
  
  // Create the signature object with correct format
  const sigObj = {
    'TLS.ver': '2.0',
    'TLS.sdkappid': parseInt(sdkAppId),
    'TLS.identifier': userId,
    'TLS.expire': parseInt(expire),
    'TLS.time': current
  };

  // Create the string to sign following Tencent's exact format
  const sigStr = `TLS.identifier:${userId}\nTLS.sdkappid:${sdkAppId}\nTLS.time:${current}\nTLS.expire:${expire}\n`;

  // Generate HMAC-SHA256 signature using the secret key
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(sigStr, 'utf8');
  const signature = hmac.digest('base64');
  
  // Add signature to object
  sigObj['TLS.sig'] = signature;

  // Convert to JSON and then base64 - no URL encoding needed
  const jsonStr = JSON.stringify(sigObj);
  const base64Str = Buffer.from(jsonStr, 'utf8').toString('base64');
  
  return base64Str;
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
    
    // Use manual implementation for consistency
    const userSig = genUserSig(sdkAppId, secretKey, String(userId), Number(expire));
    
    // Debug logging (remove in production)
    console.log('UserSig generation:', {
      sdkAppId,
      userId: String(userId),
      expire: Number(expire),
      secretKeyLength: secretKey.length,
      userSigLength: userSig.length,
      method: 'manual',
      secretKeyPrefix: secretKey.substring(0, 8),
      secretKeySuffix: secretKey.substring(secretKey.length - 8)
    });
    
    // Decode and log the UserSig structure for debugging
    try {
      const decoded = JSON.parse(Buffer.from(userSig, 'base64').toString('utf8'));
      console.log('Generated UserSig structure:', {
        version: decoded['TLS.ver'],
        sdkappid: decoded['TLS.sdkappid'],
        identifier: decoded['TLS.identifier'],
        expire: decoded['TLS.expire'],
        time: decoded['TLS.time'],
        signatureLength: decoded['TLS.sig']?.length
      });
    } catch (e) {
      console.error('Failed to decode UserSig for debugging:', e.message);
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ sdkAppId, userId, userSig, expire });
  } catch (e) {
    console.error('TRTC UserSig error', e);
    return res.status(500).json({ error: 'usersig_error', message: e?.message || String(e) });
  }
}
