# How to Get Correct TRTC Credentials

The error 70009 indicates that your SDK App ID and Secret Key don't match. Here's how to get the correct credentials:

## Step 1: Login to Tencent Cloud Console
1. Go to https://console.cloud.tencent.com/
2. Login with your Tencent Cloud account

## Step 2: Navigate to TRTC Console
1. Search for "TRTC" or "Real-Time Communication" in the console
2. Go to TRTC Console: https://console.cloud.tencent.com/trtc

## Step 3: Find Your Application
1. In the TRTC console, you should see a list of applications
2. Look for an application with SDKAppID: **20026991**
3. If you don't see this application, it might be in a different region or project

## Step 4: Get the Secret Key
1. Click on your TRTC application (SDKAppID: 20026991)
2. Go to "Application Management" → "Application Info"
3. Find the "Secret Key" section
4. Copy the Secret Key (it should be a 64-character string)

## Step 5: Verify Credentials Match
- **SDKAppID**: 20026991 (this should match what you see in console)
- **Secret Key**: Should be the one from the same application in console

## Alternative: Create New TRTC Application
If you can't find the application with SDKAppID 20026991:

1. Create a new TRTC application in the console
2. Note down the new SDKAppID and Secret Key
3. Update your .env.local file with the new credentials

## Current Credentials in Your .env.local:
```
TENCENT_SDK_APP_ID=20026991
TENCENT_SDK_SECRET_KEY=37575cb1dd19ee4c7cfa175469e625653ce291dc2c143a038f480698b12ecb4b
```

## What to Check:
1. ✅ SDK App ID format is correct (numeric)
2. ✅ Secret Key format is correct (64 characters)
3. ❌ **These two values must belong to the same TRTC application**

The error suggests that while both values are valid, they're from different applications or projects.