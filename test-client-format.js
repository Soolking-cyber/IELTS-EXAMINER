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

console.log('Testing Client-Side Format...');
console.log('SDK App ID:', sdkAppId);
console.log('Secret Key:', secretKey ? `${secretKey.substring(0, 8)}...${secretKey.substring(secretKey.length - 8)}` : 'NOT SET');

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

    console.log('Content to be signed:');
    console.log(contentToBeSigned);

    // HMAC-SHA256 signature
    const hmac = crypto.createHmac('sha256', this.secretKey);
    hmac.update(contentToBeSigned, 'utf8');
    const signature = hmac.digest('base64');

    console.log('Signature:', signature);

    // Create the signature document
    const sigDoc = {
      'TLS.ver': '2.0',
      'TLS.sdkappid': parseInt(this.sdkAppId),
      'TLS.identifier': userId,
      'TLS.expire': parseInt(expire),
      'TLS.time': current,
      'TLS.sig': signature
    };

    console.log('Signature document:', JSON.stringify(sigDoc, null, 2));

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

// Test the implementation
const userId = 'test-client-format';
const result = genTestUserSig({
  sdkAppId: sdkAppId,
  userId: userId,
  sdkSecretKey: secretKey
});

console.log('\n✅ Generated Result:');
console.log('SDK App ID:', result.sdkAppId);
console.log('UserSig:', result.userSig);
console.log('UserSig Length:', result.userSig.length);

// Test decompression
try {
  const base64Restored = result.userSig
    .replace(/\*/g, '+')
    .replace(/-/g, '/')
    .replace(/_/g, '=');
  
  const decompressed = zlib.inflateSync(Buffer.from(base64Restored, 'base64'));
  const decoded = JSON.parse(decompressed.toString('utf8'));
  
  console.log('\n✅ Decompressed successfully:');
  console.log(JSON.stringify(decoded, null, 2));
} catch (e) {
  console.log('\n❌ Failed to decompress:', e.message);
}