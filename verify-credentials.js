import fs from 'fs';
import crypto from 'crypto';

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

console.log('=== TRTC Credentials Verification ===');
console.log('SDK App ID:', sdkAppId);
console.log('Secret Key:', secretKey ? `${secretKey.substring(0, 8)}...${secretKey.substring(secretKey.length - 8)}` : 'NOT SET');
console.log('Secret Key Length:', secretKey?.length);

if (!sdkAppId || !secretKey) {
  console.error('\n❌ Missing credentials!');
  console.log('Please ensure both TENCENT_SDK_APP_ID and TENCENT_SDK_SECRET_KEY are set in .env.local');
  process.exit(1);
}

// Test UserSig generation with different methods
function genUserSigMethod1(sdkAppId, secretKey, userId, expire = 86400) {
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
  return Buffer.from(jsonStr, 'utf8').toString('base64');
}

// Alternative method using different string format
function genUserSigMethod2(sdkAppId, secretKey, userId, expire = 86400) {
  const current = Math.floor(Date.now() / 1000);
  
  const sigDoc = {
    'TLS.ver': '2.0',
    'TLS.sdkappid': parseInt(sdkAppId),
    'TLS.identifier': userId,
    'TLS.expire': parseInt(expire),
    'TLS.time': current
  };

  // Different string format - some implementations use this
  const contentToBeSigned = `TLS.identifier:${userId}\nTLS.sdkappid:${parseInt(sdkAppId)}\nTLS.time:${current}\nTLS.expire:${parseInt(expire)}\n`;
  
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(contentToBeSigned, 'utf8');
  const signature = hmac.digest('base64');
  
  sigDoc['TLS.sig'] = signature;
  const jsonStr = JSON.stringify(sigDoc);
  return Buffer.from(jsonStr, 'utf8').toString('base64');
}

const userId = 'test-verification';

console.log('\n=== Testing UserSig Generation ===');

try {
  const userSig1 = genUserSigMethod1(sdkAppId, secretKey, userId);
  console.log('\nMethod 1 UserSig:', userSig1.substring(0, 50) + '...');
  
  const userSig2 = genUserSigMethod2(sdkAppId, secretKey, userId);
  console.log('Method 2 UserSig:', userSig2.substring(0, 50) + '...');
  
  console.log('Methods match:', userSig1 === userSig2);
  
  // Decode and show structure
  const decoded = JSON.parse(Buffer.from(userSig1, 'base64').toString('utf8'));
  console.log('\nDecoded UserSig structure:');
  console.log('- Version:', decoded['TLS.ver']);
  console.log('- SDK App ID:', decoded['TLS.sdkappid']);
  console.log('- User ID:', decoded['TLS.identifier']);
  console.log('- Expire:', decoded['TLS.expire']);
  console.log('- Time:', decoded['TLS.time']);
  console.log('- Signature:', decoded['TLS.sig']);
  
  console.log('\n✅ UserSig generation appears to be working');
  console.log('\n⚠️  If you\'re still getting error 70009, the issue is likely:');
  console.log('1. SDK App ID and Secret Key don\'t belong to the same Tencent application');
  console.log('2. The Secret Key is from a different SDKAppID');
  console.log('3. The credentials are from different Tencent Cloud projects');
  
} catch (error) {
  console.error('\n❌ UserSig generation failed:', error.message);
}

console.log('\n=== Recommendations ===');
console.log('1. Verify in Tencent Cloud Console that SDK App ID', sdkAppId, 'matches your Secret Key');
console.log('2. Check that both credentials are from the same TRTC application');
console.log('3. Ensure the Secret Key hasn\'t been regenerated recently');
console.log('4. Try generating new credentials from Tencent Cloud Console if needed');