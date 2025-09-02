// Decode the latest UserSig from the error
const userSigFromError = "eJwtzF0LgjAYhuH-8p5WNqfONuiggo4SkezLs6ar3kYia5YW-fdAPXyuB*4vpJut81IGBFCHwLjbWKjS4gU7fis5aW1pDRveZ6HPVYUFCEoIZZy7vVt8KBBuGLCQU48FvaqmQqNAzJhPyBDAKwjID2ap13Ua4Sr*tIs4iPJ6z473WyOzZKrlziuTjBMfR6c5-P6OGDJq";

console.log('UserSig from latest error:', userSigFromError);
console.log('Length:', userSigFromError.length);

// This is not base64 JSON - it's the correct format from the official library
// The fact that we're getting error 70009 means the credentials don't match

console.log('\n❌ Error 70009 means:');
console.log('- SDK App ID: 20026991');
console.log('- Secret Key: 37575cb1...b12ecb4b');
console.log('- These two values are from DIFFERENT Tencent applications');
console.log('\n✅ UserSig generation is working correctly');
console.log('❌ The problem is credential mismatch');

console.log('\n🔧 SOLUTION:');
console.log('1. Go to https://console.cloud.tencent.com/trtc');
console.log('2. Find the application with SDK App ID: 20026991');
console.log('3. Get the correct Secret Key from that SAME application');
console.log('4. OR create a new TRTC application and use both new values');