// Test the official TLS-SIG-API-V2 library
import fs from 'fs';

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

console.log('Testing official TLS-SIG-API-V2 library...');
console.log('SDK App ID:', sdkAppId);
console.log('Secret Key Length:', secretKey?.length);

try {
  // Try different import methods
  let TLSSigAPIv2;
  
  try {
    TLSSigAPIv2 = await import('tls-sig-api-v2');
    console.log('✅ ES6 import successful');
  } catch (e) {
    console.log('❌ ES6 import failed:', e.message);
    try {
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      TLSSigAPIv2 = require('tls-sig-api-v2');
      console.log('✅ CommonJS require successful');
    } catch (e2) {
      console.log('❌ CommonJS require failed:', e2.message);
      throw new Error('Cannot import tls-sig-api-v2');
    }
  }
  
  console.log('Library object:', Object.keys(TLSSigAPIv2));
  
  // Try to create API instance
  const Api = TLSSigAPIv2.Api || TLSSigAPIv2.default?.Api || TLSSigAPIv2.default;
  if (!Api) {
    throw new Error('Api class not found in library');
  }
  
  const api = new Api(sdkAppId, secretKey);
  console.log('✅ API instance created');
  
  // Generate UserSig
  const userId = 'test-official-lib';
  const userSig = api.genUserSig(userId, 86400);
  
  console.log('✅ UserSig generated successfully');
  console.log('UserSig:', userSig.substring(0, 50) + '...');
  console.log('UserSig Length:', userSig.length);
  
  // Try to decode it
  try {
    const decoded = JSON.parse(Buffer.from(userSig, 'base64').toString('utf8'));
    console.log('✅ UserSig decoded successfully');
    console.log('Structure:', {
      version: decoded['TLS.ver'],
      sdkappid: decoded['TLS.sdkappid'],
      identifier: decoded['TLS.identifier']
    });
  } catch (e) {
    console.log('❌ UserSig decode failed:', e.message);
  }
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
}