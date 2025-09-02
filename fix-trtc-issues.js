#!/usr/bin/env node

// Comprehensive TRTC issue fix and test
import dotenv from 'dotenv';
import crypto from 'crypto';
import zlib from 'zlib';

dotenv.config({ path: '.env.local' });

// Exact Tencent UserSig generation (from official docs)
function genTestUserSig(sdkAppId, userId, sdkSecretKey, expire = 604800) {
  const currTime = Math.floor(Date.now() / 1000);
  
  const sigDoc = {
    'TLS.ver': '2.0',
    'TLS.identifier': String(userId),
    'TLS.sdkappid': Number(sdkAppId),
    'TLS.time': Number(currTime),
    'TLS.expire': Number(expire)
  };

  // Generate HMAC-SHA256 signature
  let contentToBeSigned = `TLS.identifier:${userId}\n`;
  contentToBeSigned += `TLS.sdkappid:${sdkAppId}\n`;
  contentToBeSigned += `TLS.time:${currTime}\n`;
  contentToBeSigned += `TLS.expire:${expire}\n`;

  const hmac = crypto.createHmac('sha256', sdkSecretKey);
  const sig = hmac.update(contentToBeSigned).digest('base64');
  sigDoc['TLS.sig'] = sig;

  // Compress and encode
  const compressed = zlib.deflateSync(Buffer.from(JSON.stringify(sigDoc)));
  const userSig = compressed.toString('base64')
    .replace(/\+/g, '*')
    .replace(/\//g, '-')
    .replace(/=/g, '_');

  return userSig;
}

// Test UserSig generation
function testUserSigGeneration() {
  console.log('🧪 Testing UserSig Generation...');
  
  const sdkAppId = process.env.TENCENT_SDK_APP_ID;
  const secretKey = process.env.TENCENT_SDK_SECRET_KEY;
  const userId = 'test-user-' + Date.now();
  
  if (!sdkAppId || !secretKey) {
    console.log('❌ Missing credentials');
    return null;
  }
  
  console.log('Credentials:');
  console.log('- SDK App ID:', sdkAppId);
  console.log('- Secret Key Length:', secretKey.length);
  console.log('- User ID:', userId);
  
  try {
    const userSig = genTestUserSig(sdkAppId, userId, secretKey);
    console.log('✅ UserSig generated successfully');
    console.log('- Length:', userSig.length);
    console.log('- First 20 chars:', userSig.substring(0, 20) + '...');
    
    return { sdkAppId: Number(sdkAppId), userId, userSig };
  } catch (error) {
    console.log('❌ UserSig generation failed:', error.message);
    return null;
  }
}

// Diagnose common TRTC issues
function diagnoseTRTCIssues() {
  console.log('\n🔍 TRTC Issue Diagnosis:');
  
  // Check error code -100006
  console.log('\n❌ Error -100006: "check privilege failed"');
  console.log('Common causes:');
  console.log('1. Invalid UserSig (expired, wrong format, or wrong credentials)');
  console.log('2. SDK App ID mismatch');
  console.log('3. User ID format issues');
  console.log('4. Room ID format issues');
  
  console.log('\n🔧 Recommended fixes:');
  console.log('1. Verify UserSig generation algorithm');
  console.log('2. Check SDK App ID matches exactly');
  console.log('3. Ensure User ID is string format');
  console.log('4. Ensure Room ID is number format');
  console.log('5. Check UserSig expiration time');
}

// Generate working TRTC configuration
function generateTRTCConfig() {
  const result = testUserSigGeneration();
  if (!result) return;
  
  console.log('\n🎯 Working TRTC Configuration:');
  console.log('```javascript');
  console.log('const trtcConfig = {');
  console.log(`  sdkAppId: ${result.sdkAppId},`);
  console.log(`  userId: "${result.userId}",`);
  console.log(`  userSig: "${result.userSig}",`);
  console.log(`  roomId: 10001`);
  console.log('};');
  console.log('```');
  
  console.log('\n📋 Frontend Integration:');
  console.log('```javascript');
  console.log('// 1. Load TRTC SDK');
  console.log('const TRTC = await loadTRTCSDK();');
  console.log('');
  console.log('// 2. Create client');
  console.log('const client = TRTC.create();');
  console.log('');
  console.log('// 3. Join room');
  console.log('await client.enterRoom({');
  console.log(`  sdkAppId: ${result.sdkAppId},`);
  console.log(`  userId: "${result.userId}",`);
  console.log('  userSig: userSig, // from API');
  console.log('  roomId: 10001');
  console.log('});');
  console.log('```');
}

// Main execution
console.log('🚀 TRTC Issue Fix & Test');
console.log('========================');

testUserSigGeneration();
diagnoseTRTCIssues();
generateTRTCConfig();

console.log('\n✅ Next Steps:');
console.log('1. Test UserSig API: node test-usersig-fix.js');
console.log('2. Test TRTC SDK: Open test-trtc-sdk.html in browser');
console.log('3. Check browser console for detailed errors');
console.log('4. Ensure HTTPS for production (TRTC requires secure context)');