export const config = { runtime: 'nodejs', api: { bodyParser: false } };

import crypto from 'crypto';
import zlib from 'zlib';
import { Buffer } from 'buffer';

// Minimal base64url helpers compatible with Tencent format
const base64url = {
  escape: (str) => str.replace(/\+/g, '*').replace(/\//g, '-').replace(/=/g, '_'),
};

class TencentApi {
  constructor(sdkappid, key) {
    this.sdkappid = sdkappid;
    this.key = key;
  }
  _hmacsha256(identifier, currTime, expire, base64UserBuf) {
    let contentToBeSigned = `TLS.identifier:${identifier}\n`;
    contentToBeSigned += `TLS.sdkappid:${this.sdkappid}\n`;
    contentToBeSigned += `TLS.time:${currTime}\n`;
    contentToBeSigned += `TLS.expire:${expire}\n`;
    if (base64UserBuf) contentToBeSigned += `TLS.userbuf:${base64UserBuf}\n`;
    return crypto.createHmac('sha256', this.key).update(contentToBeSigned).digest('base64');
  }
  genUserSig(userid, expire) {
    const currTime = Math.floor(Date.now() / 1000);
    const sigDoc = {
      'TLS.ver': '2.0',
      'TLS.identifier': String(userid),
      'TLS.sdkappid': Number(this.sdkappid),
      'TLS.time': Number(currTime),
      'TLS.expire': Number(expire),
    };
    const sig = this._hmacsha256(userid, currTime, expire, null);
    sigDoc['TLS.sig'] = sig;
    const compressed = zlib.deflateSync(Buffer.from(JSON.stringify(sigDoc))).toString('base64');
    return base64url.escape(compressed);
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');

  try {
    const env = {
      sdkAppId: Number(process.env.TENCENT_SDK_APP_ID) || null,
      hasSdkSecretKey: Boolean(process.env.TENCENT_SDK_SECRET_KEY),
      hasCloudSecretId: Boolean(process.env.TENCENT_SECRET_ID),
      hasCloudSecretKey: Boolean(process.env.TENCENT_SECRET_KEY),
      region: process.env.TENCENT_REGION || null,
    };

    const checks = { userSigOk: false, userSigLength: 0, cloudApiReady: false };
    let messages = [];

    if (!env.sdkAppId) messages.push('Missing TENCENT_SDK_APP_ID');
    if (!env.hasSdkSecretKey) messages.push('Missing TENCENT_SDK_SECRET_KEY');

    if (env.sdkAppId && env.hasSdkSecretKey) {
      try {
        const api = new TencentApi(env.sdkAppId, process.env.TENCENT_SDK_SECRET_KEY);
        const sig = api.genUserSig('healthcheck', 60);
        checks.userSigOk = typeof sig === 'string' && sig.length > 16;
        checks.userSigLength = (sig || '').length;
      } catch (e) {
        messages.push('UserSig generation failed: ' + (e?.message || String(e)));
      }
    }

    checks.cloudApiReady = env.hasCloudSecretId && env.hasCloudSecretKey;
    if (!checks.cloudApiReady) messages.push('Cloud API calls (start/stop) will be skipped (no TENCENT_SECRET_ID/KEY)');

    const ok = checks.userSigOk;
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ ok, env, checks, messages });
  } catch (e) {
    console.error('TRTC health error', e);
    return res.status(500).json({ ok: false, error: 'health_error', message: e?.message || String(e) });
  }
}

