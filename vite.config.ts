import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL),
        'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY),
        'process.env.STT_URL': JSON.stringify(env.STT_URL),
        'process.env.SITE_URL': JSON.stringify(env.SITE_URL),
        'process.env.TENCENT_SECRET_ID': JSON.stringify(env.TENCENT_SECRET_ID),
        'process.env.TENCENT_SECRET_KEY': JSON.stringify(env.TENCENT_SECRET_KEY),
        'process.env.TENCENT_REGION': JSON.stringify(env.TENCENT_REGION),
        'process.env.TENCENT_SDK_APP_ID': JSON.stringify(env.TENCENT_SDK_APP_ID),
        'process.env.TENCENT_ROOM_ID': JSON.stringify(env.TENCENT_ROOM_ID),
        'process.env.TENCENT_USER_ID': JSON.stringify(env.TENCENT_USER_ID),
        'process.env.TENCENT_AGENT_ID': JSON.stringify(env.TENCENT_AGENT_ID),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
