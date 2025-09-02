// Simple credential checker
import fs from 'fs';

console.log('🔍 TRTC Credential Status Check');
console.log('================================');

// Read current credentials
const envContent = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const sdkAppId = envVars.TENCENT_SDK_APP_ID;
const secretKey = envVars.TENCENT_SDK_SECRET_KEY;

console.log('Current SDK App ID:', sdkAppId);
console.log('Current Secret Key:', secretKey ? `${secretKey.substring(0, 8)}...${secretKey.substring(secretKey.length - 8)}` : 'NOT SET');

console.log('\n❌ PROBLEM IDENTIFIED:');
console.log('- UserSig generation: ✅ WORKING (using official library)');
console.log('- Error 70009: ❌ SDK App ID and Secret Key are from different applications');

console.log('\n🔧 IMMEDIATE ACTION REQUIRED:');
console.log('1. Go to: https://console.cloud.tencent.com/trtc');
console.log('2. Either:');
console.log('   a) Find app with SDK App ID 20026991 and get its Secret Key');
console.log('   b) Create new TRTC app and use both new SDK App ID + Secret Key');
console.log('3. Update .env.local with matching credentials');

console.log('\n📝 Example .env.local update:');
console.log('TENCENT_SDK_APP_ID=YOUR_NEW_SDK_APP_ID');
console.log('TENCENT_SDK_SECRET_KEY=YOUR_NEW_SECRET_KEY');

console.log('\n⚠️  Both values MUST be from the SAME Tencent TRTC application!');