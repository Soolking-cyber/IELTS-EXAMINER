# TRTC Error -100006 Fix Guide

## 🔍 Problem Analysis
Your TRTC error `-100006: check privilege failed` indicates authentication issues. Based on the logs, there are two main problems:

1. **UserSig Authentication Failure** - The generated UserSig is being rejected
2. **TRTC SDK Loading Issues** - CDN sources are failing

## ✅ Fixes Applied

### 1. UserSig API Enhancement
- ✅ Added support for both GET and POST methods
- ✅ Improved parameter handling
- ✅ Enhanced error logging

### 2. TRTC SDK Loading Fix
- ✅ Updated CDN URLs to working versions
- ✅ Added fallback CDN sources
- ✅ Better error handling

### 3. Frontend Data Type Validation
- ✅ Ensured proper data types for TRTC parameters
- ✅ Added detailed error logging
- ✅ Better debugging information

## 🧪 Testing Steps

### Step 1: Start Development Server
```bash
npm run dev
```

### Step 2: Test UserSig Generation
Open browser and navigate to: `http://localhost:3000/test-trtc-sdk.html`

This will test:
- ✅ TRTC SDK loading from multiple CDNs
- ✅ UserSig API functionality
- ✅ Browser compatibility
- ✅ TRTC client creation

### Step 3: Test IELTS Examiner App
1. Open your IELTS Examiner app
2. Select a part (Part 1, 2, or 3)
3. Click "Start Recording"
4. Check browser console for detailed logs

## 🔧 Key Configuration

### Environment Variables (.env.local)
```
TENCENT_SDK_APP_ID=20026991
TENCENT_SDK_SECRET_KEY=37575cb1dd19ee4c7cfa175469e625653ce291dc2c143a038f480698b12ecb4b
TENCENT_REGION=ap-singapore
TENCENT_ROOM_ID=10001
TENCENT_USER_ID=ielts-ai-agent
TENCENT_AGENT_ID=ielts-examiner-ai
```

### Working TRTC Parameters
```javascript
{
  sdkAppId: 20026991,           // Number
  userId: "unique-user-id",     // String
  userSig: "generated-sig",     // String from API
  roomId: 10001                 // Number
}
```

## 🚨 Common Issues & Solutions

### Issue 1: Error -100006
**Cause**: Invalid UserSig or wrong credentials
**Solution**: 
- Verify SDK App ID matches exactly
- Check secret key is correct
- Ensure UserSig is not expired
- Validate user ID format

### Issue 2: TRTC SDK Loading Failed
**Cause**: CDN sources unavailable
**Solution**:
- Updated to working CDN URLs
- Added multiple fallback sources
- Check network connectivity

### Issue 3: Browser Compatibility
**Cause**: TRTC not supported in browser
**Solution**:
- Use Chrome, Firefox, or Safari
- Ensure HTTPS in production
- Check WebRTC support

## 🎯 Expected Behavior After Fix

1. **UserSig Generation**: Should return valid signature
2. **TRTC SDK Loading**: Should load from CDN successfully
3. **Room Connection**: Should connect without -100006 error
4. **AI Conversation**: Should start IELTS examiner interaction

## 📋 Verification Checklist

- [ ] UserSig API returns valid response
- [ ] TRTC SDK loads in browser
- [ ] Browser console shows no -100006 errors
- [ ] TRTC client connects to room successfully
- [ ] AI conversation starts properly
- [ ] Audio recording works

## 🚀 Next Steps

1. **Test the fixes**: Run the test files created
2. **Monitor logs**: Check browser console for detailed error info
3. **Verify credentials**: Ensure all TRTC credentials are correct
4. **Production deployment**: Ensure HTTPS for production use

## 📞 If Issues Persist

If you still get -100006 errors after these fixes:

1. **Check Tencent Console**: Verify your TRTC application is active
2. **Validate Credentials**: Double-check SDK App ID and Secret Key
3. **Test Different User IDs**: Try with different user ID formats
4. **Check Room Limits**: Ensure room isn't at capacity
5. **Verify Region**: Confirm ap-singapore region is correct

The fixes should resolve the authentication and SDK loading issues you're experiencing.