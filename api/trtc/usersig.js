module.exports.config = { runtime: 'nodejs', api: { bodyParser: true } };

const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });
const crypto = require('crypto');
const { Buffer } = require('buffer');
const zlib = require('zlib');

// Base64URL utilities (exact from Tencent's official code)
const base64url = {};
const newBuffer = function (fill, encoding) {
  return Buffer.from ? Buffer.from(fill, encoding) : new Buffer(fill, encoding);
};

base64url.unescape = function unescape(str) {
  return (str + Array(5 - str.length % 4)).replace(/_/g, '=').replace(/\-/g, '/').replace(/\*/g, '+');
};

base64url.escape = function escape(str) {
  return str.replace(/\+/g, '*').replace(/\//g, '-').replace(/=/g, '_');
};

base64url.encode = function encode(str) {
  return this.escape(newBuffer(str).toString('base64'));
};

base64url.decode = function decode(str) {
  return newBuffer(this.unescape(str), 'base64').toString();
};

function base64encode(str) {
  return newBuffer(str).toString('base64');
}

function base64decode(str) {
  return newBuffer(str, 'base64').toString();
}

// Tencent's Official API Class (exact implementation)
class TencentApi {
  constructor(sdkappid, key) {
    this.sdkappid = sdkappid;
    this.key = key;
  }

  // Generate the hmac value of base64 by passing in the parameters (exact from Tencent)
  _hmacsha256(identifier, currTime, expire, base64UserBuf) {
    let contentToBeSigned = "TLS.identifier:" + identifier + "\n";
    contentToBeSigned += "TLS.sdkappid:" + this.sdkappid + "\n";
    contentToBeSigned += "TLS.time:" + currTime + "\n";
    contentToBeSigned += "TLS.expire:" + expire + "\n";
    if (null != base64UserBuf) {
      contentToBeSigned += "TLS.userbuf:" + base64UserBuf + "\n";
    }
    const hmac = crypto.createHmac("sha256", this.key);
    return hmac.update(contentToBeSigned).digest('base64');
  }

  // Generate signature (exact from Tencent)
  genSig(userid, expire, userBuf) {
    const currTime = Math.floor(Date.now() / 1000);
    const sigDoc = {
      'TLS.ver': "2.0",
      'TLS.identifier': "" + userid,
      'TLS.sdkappid': Number(this.sdkappid),
      'TLS.time': Number(currTime),
      'TLS.expire': Number(expire)
    };

    let sig = '';
    if (null != userBuf) {
      const base64UserBuf = base64encode(userBuf);
      sigDoc['TLS.userbuf'] = base64UserBuf;
      sig = this._hmacsha256(userid, currTime, expire, base64UserBuf);
    } else {
      sig = this._hmacsha256(userid, currTime, expire, null);
    }
    sigDoc['TLS.sig'] = sig;

    const compressed = zlib.deflateSync(newBuffer(JSON.stringify(sigDoc))).toString('base64');
    return base64url.escape(compressed);
  }

  // Generate UserSig (exact from Tencent)
  genUserSig(userid, expire) {
    return this.genSig(userid, expire, null);
  }
}

// Wrapper function to match your client format
function genTestUserSig({ sdkAppId, userId, sdkSecretKey }) {
  const SDKAPPID = sdkAppId;
  const EXPIRETIME = 604800; // 7 days
  const SDKSECRETKEY = sdkSecretKey;

  // Use Tencent's official API
  const api = new TencentApi(SDKAPPID, SDKSECRETKEY);
  const userSig = api.genUserSig(userId, EXPIRETIME);

  return {
    sdkAppId: SDKAPPID,
    userSig: userSig
  };
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  
  // Support both GET and POST methods
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }
  try {
    const sdkAppId = Number(process.env.TENCENT_SDK_APP_ID);
    // Important: Only use the TRTC SDK secret. Do NOT fall back to cloud API secret.
    const secretKey = process.env.TENCENT_SDK_SECRET_KEY;
    if (!sdkAppId || !secretKey) {
      return res.status(500).json({ error: 'Missing TENCENT_SDK_APP_ID or TENCENT_SDK_SECRET_KEY' });
    }
    // Support both GET and POST parameters
    const { userId, expire = 86400 } = req.method === 'GET' 
      ? req.query 
      : (req.body || {});
    
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

module.exports = handler;
