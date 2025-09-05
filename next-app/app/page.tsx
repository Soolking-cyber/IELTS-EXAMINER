"use client";
import React, { useEffect } from 'react';
import '@/components/gdm';

export default function Page() {
  useEffect(() => {
    // no-op: ensures client-side hydration
  }, []);
  return (
    <main className="min-h-screen">
      <gdm-live-audio></gdm-live-audio>
    </main>
  );
}

