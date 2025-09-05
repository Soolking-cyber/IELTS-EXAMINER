"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function AuthBar() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!supabase) return;
        const { data } = await supabase.auth.getUser();
        if (mounted) setEmail(data.user?.email ?? null);
      } catch {}
    })();
    const sub = supabase?.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => { mounted = false; sub?.data.subscription.unsubscribe(); };
  }, []);

  const signIn = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const redirectTo = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '') || window.location.origin;
      await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    setLoading(true);
    try { await supabase.auth.signOut(); } finally { setLoading(false); }
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
      <div className="text-sm text-white/80">IELTS Examiner</div>
      <div>
        {email ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/70">{email}</span>
            <button className="text-xs px-3 py-1 rounded bg-white/10 hover:bg-white/20" onClick={signOut} disabled={loading}>Sign out</button>
          </div>
        ) : (
          <button className="text-xs px-3 py-1 rounded bg-white/10 hover:bg-white/20" onClick={signIn} disabled={loading}>Sign in with Google</button>
        )}
      </div>
    </div>
  );
}

