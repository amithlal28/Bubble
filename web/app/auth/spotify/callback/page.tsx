'use client';

import { useEffect, useState } from 'react';

export default function SpotifyAuthCallback() {
    const [status, setStatus] = useState<'exchanging' | 'success' | 'error'>('exchanging');
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const error = params.get('error');

        if (error) {
            setStatus('error');
            setErrorMessage(error === 'access_denied' ? 'Authorization was cancelled.' : error);
            return;
        }

        if (!code) {
            setStatus('error');
            setErrorMessage('No authorization code found in callback.');
            return;
        }

        const exchange = async () => {
            try {
                const redirectUri = window.location.origin + '/auth/spotify/callback';
                const res = await fetch('/api/spotify/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'exchange',
                        code,
                        redirect_uri: redirectUri
                    })
                });

                const data = await res.json();
                if (!res.ok || !data.access_token) {
                    throw new Error(data.error || 'Failed to exchange authorization code');
                }

                // Fetch profile
                const profRes = await fetch('/api/spotify/profile', {
                    headers: { 'x-spotify-token': data.access_token }
                });
                const profile = profRes.ok ? await profRes.json() : { id: 'spotify_user', display_name: 'Spotify User' };

                setStatus('success');

                const payload = {
                    type: 'SPOTIFY_AUTH_SUCCESS',
                    token: data.access_token,
                    accessToken: data.access_token,
                    refreshToken: data.refresh_token,
                    expiresIn: data.expires_in || 3600,
                    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
                    profile
                };

                if (window.opener) {
                    window.opener.postMessage(payload, window.location.origin);
                    setTimeout(() => window.close(), 600);
                } else {
                    localStorage.setItem('creds_spotify_token', data.access_token);
                    if (data.refresh_token) localStorage.setItem('creds_spotify_refresh_token', data.refresh_token);
                    localStorage.setItem('creds_spotify_token_expiry', String(Date.now() + (data.expires_in || 3600) * 1000));
                    setTimeout(() => {
                        window.location.href = '/#settings';
                    }, 1000);
                }
            } catch (err: any) {
                setStatus('error');
                setErrorMessage(err.message || 'Authentication failed');
            }
        };

        exchange();
    }, []);

    return (
        <div style={{
            minHeight: '100vh',
            background: '#09090b',
            color: '#fff',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
        }}>
            <div style={{
                background: '#18181b',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 16,
                padding: 32,
                maxWidth: 420,
                width: '100%',
                textAlign: 'center',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            }}>
                <div style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: 'rgba(29, 185, 84, 0.15)',
                    border: '1px solid rgba(29, 185, 84, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 20px',
                    color: '#1ed760',
                }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.498 17.306c-.217.355-.678.47-1.033.253-2.83-1.73-6.393-2.12-10.59-1.162-.405.093-.81-.16-.902-.566-.093-.406.16-.81.566-.903 4.59-1.047 8.528-.606 11.705 1.344.356.217.47.678.254 1.034zm1.467-3.26c-.274.444-.86.588-1.304.314-3.24-1.99-8.18-2.567-12.012-1.403-.497.15-1.025-.133-1.176-.63-.152-.497.133-1.025.63-1.177 4.382-1.33 9.824-.688 13.548 1.592.444.274.588.86.314 1.304zm.126-3.41c-3.885-2.307-10.29-2.52-14.004-1.393-.596.18-1.226-.157-1.407-.753-.18-.596.157-1.227.753-1.407 4.268-1.296 11.332-1.045 15.82 1.62.536.318.71 1.01.392 1.546-.318.536-1.01.71-1.554.387z" />
                    </svg>
                </div>

                {status === 'exchanging' && (
                    <>
                        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Connecting to Spotify...</h2>
                        <p style={{ fontSize: 13, color: '#a1a1aa', margin: 0 }}>Securing session tokens and synchronizing your profile.</p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#4ade80', marginBottom: 8 }}>Successfully Connected!</h2>
                        <p style={{ fontSize: 13, color: '#a1a1aa', margin: 0 }}>Closing this window and returning to Bubble...</p>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f87171', marginBottom: 8 }}>Connection Failed</h2>
                        <p style={{ fontSize: 13, color: '#a1a1aa', marginBottom: 16 }}>{errorMessage}</p>
                        <button
                            onClick={() => window.close()}
                            style={{
                                padding: '8px 16px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                borderRadius: 8,
                                color: '#fff',
                                fontSize: 13,
                                cursor: 'pointer',
                            }}
                        >
                            Close Window
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
