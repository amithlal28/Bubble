'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /connect/arcod — Handles the ARCOD OAuth callback.
 * Supabase redirects here with #access_token=... in the URL hash.
 * We extract it, store it, and redirect to settings.
 */
export default function ArcodCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState('Processing login...');

  useEffect(() => {
    try {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);

      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const expiresIn = params.get('expires_in');

      if (accessToken) {
        const session = {
          accessToken,
          refreshToken,
          expiresAt: Date.now() + (parseInt(expiresIn || '3600') * 1000),
        };
        localStorage.setItem('creds_arcod_token', accessToken);
        localStorage.setItem('creds_arcod_session', JSON.stringify(session));
        setStatus('ARCOD connected! Redirecting...');
        setTimeout(() => router.push('/'), 1000);
      } else {
        setStatus('Login failed. No token received. Please try again.');
      }
    } catch (e: any) {
      setStatus('Error: ' + e.message);
    }
  }, [router]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#0a0a0a', color: '#fff', flexDirection: 'column', gap: '16px'
    }}>
      <div style={{
        width: '40px', height: '40px', border: '3px solid #1a1a1a',
        borderTopColor: '#1ed760', borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <p style={{ fontSize: '14px', color: '#b3b3b3' }}>{status}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
