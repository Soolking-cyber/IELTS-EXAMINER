import fs from 'fs';
import crypto from 'crypto';

// Read environment variables from .env.local
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

console.log('SDK App ID:', sdkAppId);
console.log('Secret Key Length:', secretKey?.length);

if (!sdkAppId || !secretKey) {
  console.error('Missing TENCENT_SDK_APP_ID or TENCENT_SDK_SECRET_KEY');
  process.exit(1);
}

// Generate UserSig
function genUserSig(sdkAppId, secretKey, userId, expire = 86400) {
  const current = Math.floor(Date.now() / 1000);
  
  const sigObj = {
    'TLS.ver': '2.0',
    'TLS.sdkappid': parseInt(sdkAppId),
    'TLS.identifier': userId,
    'TLS.expire': parseInt(expire),
    'TLS.time': current
  };

  const sigStr = `TLS.identifier:${userId}\nTLS.sdkappid:${sdkAppId}\nTLS.time:${current}\nTLS.expire:${expire}\n`;

  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(sigStr, 'utf8');
  const signature = hmac.digest('base64');
  
  sigObj['TLS.sig'] = signature;

  const jsonStr = JSON.stringify(sigObj);
  const base64Str = Buffer.from(jsonStr, 'utf8').toString('base64');
  
  return base64Str;
}

const userId = 'test-user-123';
const userSig = genUserSig(sdkAppId, secretKey, userId);

console.log('\nGenerated UserSig:');
console.log('User ID:', userId);
console.log('UserSig:', userSig);
console.log('UserSig Length:', userSig.length);

// Decode and verify
try {
  const decoded = JSON.parse(Buffer.from(userSig, 'base64').toString('utf8'));
  console.log('\nDecoded UserSig object:');
  console.log(JSON.stringify(decoded, null, 2));
} catch (e) {
  console.error('Failed to decode UserSig:', e.message);
}