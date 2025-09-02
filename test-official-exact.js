import fs from 'fs';
import crypto from 'crypto';
import zlib from 'zlib';

// Read environment variables
const envContent = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const sdkAppId = parseInt(envVars.TENCENT_SDK_APP_ID);
const secretKey = envVars.TENCENT_SDK_SECRET_KEY;

console.log('Testing EXACT Tencent Official Implementation...');
console.log('SDK App ID:', sdkAppId);
console.log('Secret Key:', secretKey ? `${secretKey.substring(0, 8)}...${secretKey.substring(secretKey.length - 8)}` : 'NOT SET');

// EXACT Tencent implementation from their official code
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

class TencentApi {
  constructor(sdkappid, key) {
    this.sdkappid = sdkappid;
    this.key = key;
  }

  _hmacsha256(identifier, currTime, expire, base64UserBuf) {
    let contentToBeSigned = "TLS.identifier:" + identifier + "\n";
    contentToBeSigned += "TLS.sdkappid:" + this.sdkappid + "\n";
    contentToBeSigned += "TLS.time:" + currTime + "\n";
    contentToBeSigned += "TLS.expire:" + expire + "\n";
    if (null != base64UserBuf) {
      contentToBeSigned += "TLS.userbuf:" + base64UserBuf + "\n";
    }
    
    console.log('Content to be signed:');
    console.log(JSON.stringify(contentToBeSigned));
    
    const hmac = crypto.createHmac("sha256", this.key);
    const signature = hmac.update(contentToBeSigned).digest('base64');
    
    console.log('HMAC-SHA256 signature:', signature);
    return signature;
  }

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

    console.log('Signature document:', JSON.stringify(sigDoc, null, 2));

    const compressed = zlib.deflateSync(newBuffer(JSON.stringify(sigDoc))).toString('base64');
    const escaped = base64url.escape(compressed);
    
    console.log('Compressed (base64):', compressed.substring(0, 50) + '...');
    console.log('Escaped (final):', escaped.substring(0, 50) + '...');
    
    return escaped;
  }

  genUserSig(userid, expire) {
    return this.genSig(userid, expire, null);
  }
}

// Test the exact implementation
const userId = 'test-exact-impl';
const api = new TencentApi(sdkAppId, secretKey);
const userSig = api.genUserSig(userId, 604800);

console.log('\n✅ Generated UserSig (Exact Tencent Implementation):');
console.log('UserSig:', userSig);
console.log('UserSig Length:', userSig.length);

// Test decompression
try {
  const unescaped = base64url.unescape(userSig);
  const decompressed = zlib.inflateSync(Buffer.from(unescaped, 'base64'));
  const decoded = JSON.parse(decompressed.toString('utf8'));
  
  console.log('\n✅ Decompressed successfully:');
  console.log(JSON.stringify(decoded, null, 2));
} catch (e) {
  console.log('\n❌ Failed to decompress:', e.message);
}