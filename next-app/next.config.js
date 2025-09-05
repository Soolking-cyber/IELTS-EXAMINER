/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Map NEXT_PUBLIC_* to the keys the existing UI expects
    const { DefinePlugin } = require('webpack');
    const envMap = {
      'process.env.SUPABASE_URL': JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_URL || ''),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''),
      'process.env.SITE_URL': JSON.stringify(process.env.NEXT_PUBLIC_SITE_URL || ''),
      'process.env.WS_URL': JSON.stringify(process.env.NEXT_PUBLIC_WS_URL || ''),
      'process.env.STT_URL': JSON.stringify(process.env.NEXT_PUBLIC_STT_URL || ''),
      'process.env.DEEPGRAM_FRONTEND_TOKEN': JSON.stringify(process.env.NEXT_PUBLIC_DEEPGRAM_FRONTEND_TOKEN || ''),
      'process.env.GEMINI_API_KEY': JSON.stringify(process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''),
    };
    config.plugins.push(new DefinePlugin(envMap));
    return config;
  },
};

module.exports = nextConfig;

