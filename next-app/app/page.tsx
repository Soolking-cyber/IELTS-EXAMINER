"use client";
import React, { useEffect } from 'react';
import AuthBar from '@/components/AuthBar';
import '@/components/gdm';

export default function Page() {
  useEffect(() => {
    // no-op: ensures client-side hydration
  }, []);
  return (
    <main className="min-h-screen">
      <AuthBar />
      <gdm-live-audio></gdm-live-audio>
    </main>
  );
}
