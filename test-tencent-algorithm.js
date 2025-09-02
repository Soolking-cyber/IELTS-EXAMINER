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

console.log('Testing Tencent Official Algorithm...');
console.log('SDK App ID:', sdkAppId);
console.log('Secret Key:', secretKey ? `${secretKey.substring(0, 8)}...${secretKey.substring(secretKey.length - 8)}` : 'NOT SET');

// Tencent's official UserSig generation algorithm
function genUserSig(sdkAppId, secretKey, userId, expire = 86400) {
  const current = Math.floor(Date.now() / 1000);
  
  // Create the content to be signed (exact format from Tencent docs)
  const contentToBeSigned = 
    'TLS.identifier:' + userId + '\n' +
    'TLS.sdkappid:' + sdkAppId + '\n' +
    'TLS.time:' + current + '\n' +
    'TLS.expire:' + expire + '\n';

  console.log('Content to be signed:');
  console.log(contentToBeSigned);

  // Calculate HMAC-SHA256 signature
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(contentToBeSigned, 'utf8');
  const signature = hmac.digest('base64');

  console.log('HMAC-SHA256 signature:', signature);

  // Create the UserSig object
  const userSigDoc = {
    'TLS.ver': '2.0',
    'TLS.sdkappid': parseInt(sdkAppId),
    'TLS.identifier': userId,
    'TLS.expire': parseInt(expire),
    'TLS.time': current,
    'TLS.sig': signature
  };

  console.log('UserSig document:', JSON.stringify(userSigDoc, null, 2));

  // Convert to JSON and compress with zlib
  const jsonStr = JSON.stringify(userSigDoc);
  const compressed = zlib.deflateSync(Buffer.from(jsonStr, 'utf8'));
  
  // Base64 encode and make URL-safe
  const userSig = compressed.toString('base64')
    .replace(/\+/g, '*')
    .replace(/\//g, '-')
    .replace(/=/g, '_');

  return userSig;
}

const userId = 'test-tencent-algo';
const userSig = genUserSig(sdkAppId, secretKey, userId);

console.log('\n✅ Generated UserSig:', userSig);
console.log('UserSig Length:', userSig.length);

// Test decompression
try {
  const base64Restored = userSig
    .replace(/\*/g, '+')
    .replace(/-/g, '/')
    .replace(/_/g, '=');
  
  const decompressed = zlib.inflateSync(Buffer.from(base64Restored, 'base64'));
  const decoded = JSON.parse(decompressed.toString('utf8'));
  
  console.log('\n✅ Decompressed and decoded successfully:');
  console.log(JSON.stringify(decoded, null, 2));
} catch (e) {
  console.log('\n❌ Failed to decompress:', e.message);
}