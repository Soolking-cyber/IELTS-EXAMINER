#!/usr/bin/env node

// Test UserSig generation with exact credentials
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Test both GET and POST methods
async function testUserSigAPI() {
  const baseUrl = 'http://localhost:3000'; // Change if different
  const userId = 'test-user-' + Date.now();
  
  console.log('🧪 Testing UserSig API...');
  console.log('User ID:', userId);
  
  // Test POST method (current implementation)
  try {
    console.log('\n📤 Testing POST method...');
    const postResponse = await fetch(`${baseUrl}/api/trtc/usersig`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    
    if (postResponse.ok) {
      const postResult = await postResponse.json();
      console.log('✅ POST Success:', {
        sdkAppId: postResult.sdkAppId,
        userId: postResult.userId,
        userSigLength: postResult.userSig?.length,
        expire: postResult.expire
      });
      
      // Validate UserSig format
      if (postResult.userSig && postResult.userSig.length > 100) {
        console.log('✅ UserSig format looks valid');
      } else {
        console.log('❌ UserSig format looks invalid');
      }
    } else {
      console.log('❌ POST Failed:', await postResponse.text());
    }
  } catch (error) {
    console.log('❌ POST Error:', error.message);
  }
  
  // Test GET method (for compatibility)
  try {
    console.log('\n📥 Testing GET method...');
    const getResponse = await fetch(`${baseUrl}/api/trtc/usersig?userId=${userId}`);
    
    if (getResponse.ok) {
      const getResult = await getResponse.json();
      console.log('✅ GET Success:', {
        sdkAppId: getResult.sdkAppId,
        userId: getResult.userId,
        userSigLength: getResult.userSig?.length,
        expire: getResult.expire
      });
    } else {
      console.log('❌ GET Failed:', await getResponse.text());
    }
  } catch (error) {
    console.log('❌ GET Error:', error.message);
  }
}

// Test credentials
console.log('🔑 TRTC Credentials Check:');
console.log('SDK App ID:', process.env.TENCENT_SDK_APP_ID);
console.log('Secret Key Length:', process.env.TENCENT_SDK_SECRET_KEY?.length);
console.log('Region:', process.env.TENCENT_REGION);

if (!process.env.TENCENT_SDK_APP_ID || !process.env.TENCENT_SDK_SECRET_KEY) {
  console.log('❌ Missing TRTC credentials in .env.local');
  process.exit(1);
}

// Run test if server is available
testUserSigAPI().catch(console.error);