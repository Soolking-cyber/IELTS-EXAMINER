// Test script to verify UserSig generation
import crypto from 'crypto';
import { Buffer } from 'buffer';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Try to use the official TLS-SIG-API-V2 library if available
let TLSSigAPIv2;
try {
  TLSSigAPIv2 = await import('tls-sig-api-v2');
} catch (e) {
  console.log('TLS-SIG-API-V2 not available, using manual implementation');
}

// Manual UserSig generation
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

  // Convert to JSON and then base64
  const jsonStr = JSON.stringify(sigObj);
  const base64Str = Buffer.from(jsonStr, 'utf8').toString('base64');
  
  return base64Str;
}

// Test the UserSig generation
const sdkAppId = Number(process.env.TENCENT_SDK_APP_ID);
const secretKey = process.env.TENCENT_SDK_SECRET_KEY;
const userId = 'test-user-' + Math.random().toString(36).slice(2, 8);

console.log('Testing UserSig generation...');
console.log('SDK App ID:', sdkAppId);
console.log('Secret Key Length:', secretKey?.length);
console.log('User ID:', userId);

if (!sdkAppId || !secretKey) {
  console.error('Missing TENCENT_SDK_APP_ID or TENCENT_SDK_SECRET_KEY in .env.local');
  process.exit(1);
}

// Test manual implementation
const manualUserSig = genUserSig(sdkAppId, secretKey, userId);
console.log('\nManual UserSig:', manualUserSig);
console.log('Manual UserSig Length:', manualUserSig.length);

// Test official library if available
if (TLSSigAPIv2) {
  try {
    const api = new TLSSigAPIv2.Api(sdkAppId, secretKey);
    const officialUserSig = api.genUserSig(userId, 86400);
    console.log('\nOfficial UserSig:', officialUserSig);
    console.log('Official UserSig Length:', officialUserSig.length);
    console.log('UserSigs match:', manualUserSig === officialUserSig);
  } catch (e) {
    console.error('Official library error:', e.message);
  }
} else {
  console.log('\nOfficial library not available');
}

console.log('\nTest completed!');