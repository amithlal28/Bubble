'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const ARCOD_SUPABASE_URL = 'https://fnlghyzwyoklfqyhqlav.supabase.co';
const ARCOD_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubGdoeXp3eW9rbGZxeWhxbGF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDExODAsImV4cCI6MjA4OTY3NzE4MH0.9J1-JK1jJYunBM6bF-_MLR5UvhDV4BibXordTOzH2_0';

export default function ArcodAuthCallbackPage() {
    const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
    const [message, setMessage] = useState('Connecting your ARCOD account...');

    useEffect(() => {
        (async () => {
            try {
                const supabase = createClient(ARCOD_SUPABASE_URL, ARCOD_ANON_KEY);

                // 1. Check if Supabase redirected with #access_token=... (Implicit Flow)
                const hash = window.location.hash.substring(1);
                const search = window.location.search.substring(1);
                const hashParams = new URLSearchParams(hash);
                const searchParams = new URLSearchParams(search);

                const errorMsg = searchParams.get('error_description') || hashParams.get('error_description') || searchParams.get('error') || hashParams.get('error');
                if (errorMsg) {
                    throw new Error(errorMsg);
                }

                let accessToken = hashParams.get('access_token') || searchParams.get('access_token');
                let refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token') || '';
                let expiresIn = hashParams.get('expires_in') || searchParams.get('expires_in') || '3600';
                let userEmail = 'Google User';

                // 2. Check if Supabase redirected with ?code=... (PKCE / Auth Code Flow)
                const code = searchParams.get('code') || hashParams.get('code');
                if (!accessToken && code) {
                    setMessage('Exchanging authorization code...');
                    try {
                        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
                        if (error) {
                            console.warn('[ARCOD] PKCE exchange error:', error);
                        } else if (data?.session) {
                            accessToken = data.session.access_token;
                            refreshToken = data.session.refresh_token;
                            expiresIn = String(data.session.expires_in || 3600);
                            userEmail = data.session.user?.email || 'Google User';
                        }
                    } catch (e: any) {
                        console.warn('[ARCOD] PKCE exchange exception:', e.message);
                    }
                }

                // 3. Check if supabase client has session in storage
                if (!accessToken) {
                    const { data } = await supabase.auth.getSession();
                    if (data?.session) {
                        accessToken = data.session.access_token;
                        refreshToken = data.session.refresh_token;
                        userEmail = data.session.user?.email || 'Google User';
                    }
                }

                if (!accessToken) {
                    throw new Error('Could not retrieve access token from Google sign-in. Please try again or sign in with your email & password.');
                }

                // 4. Retrieve user profile if email not yet found
                if (userEmail === 'Google User') {
                    try {
                        const userRes = await fetch(`${ARCOD_SUPABASE_URL}/auth/v1/user`, {
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'apikey': ARCOD_ANON_KEY,
                            },
                        });
                        if (userRes.ok) {
                            const userData = await userRes.json();
                            if (userData && userData.email) {
                                userEmail = userData.email;
                            }
                        }
                    } catch { }
                }

                const expiresAt = Math.floor(Date.now() / 1000) + (parseInt(expiresIn || '3600', 10) || 3600);

                const session = {
                    accessToken,
                    refreshToken,
                    expiresAt,
                    userEmail,
                };

                // Store in local storage directly
                try {
                    localStorage.setItem('creds_arcod_session', JSON.stringify(session));
                    localStorage.setItem('creds_arcod_token', accessToken);
                } catch { }

                // Post message to opener window
                if (window.opener && !window.opener.closed) {
                    try {
                        window.opener.postMessage({
                            type: 'ARCOD_AUTH_SUCCESS',
                            session,
                        }, '*');
                    } catch { }
                }

                setStatus('success');
                setMessage(`Connected as ${userEmail}! Closing window...`);

                // Close popup after brief delay
                setTimeout(() => {
                    if (window.opener && !window.opener.closed) {
                        window.close();
                    } else {
                        window.location.href = '/#settings';
                    }
                }, 800);
            } catch (err: any) {
                console.error('[ARCOD Callback] Error:', err);
                setStatus('error');
                setMessage(err.message || 'Authentication failed. Please try again.');
            }
        })();
    }, []);

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0e0e14',
            color: '#fff',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            padding: '24px',
        }}>
            <div style={{
                maxWidth: '420px',
                width: '100%',
                background: '#181824',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '32px',
                textAlign: 'center',
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}>
                <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: status === 'error' ? '#ef4444' : '#22c55e',
                    color: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 18px',
                    fontSize: '22px',
                    fontWeight: 'bold',
                }}>
                    {status === 'processing' ? '↻' : (status === 'error' ? '✕' : '✓')}
                </div>

                <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>
                    {status === 'processing' ? 'Connecting to ARCOD' : (status === 'error' ? 'Sign-In Incomplete' : 'Connected!')}
                </h2>

                <p style={{ fontSize: '13px', color: '#a1a1aa', lineHeight: 1.5, marginBottom: '20px' }}>
                    {message}
                </p>

                {status === 'error' && (
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                        <button
                            onClick={() => {
                                if (window.opener) window.close();
                                else window.location.href = '/#settings';
                            }}
                            style={{
                                background: '#22c55e',
                                border: 'none',
                                color: '#000',
                                padding: '10px 20px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: '700',
                            }}
                        >
                            Return to Settings
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
