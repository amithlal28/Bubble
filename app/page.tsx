'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export default function HomePage() {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Dynamic import to avoid SSR issues with Supabase client
        import('@/lib/supabase-browser').then(({ createClient }) => {
            const supabase = createClient();
            (window as any).__bubbleSupabase = supabase;

            supabase.auth.getSession().then(async ({ data: { session } }) => {
                if (session?.user) {
                    try {
                        const res = await fetch('/api/integrations');
                        if (res.ok) {
                            const data = await res.json();
                            if (data.spotify_access_token) localStorage.setItem('creds_spotify_token', data.spotify_access_token);
                            if (data.spotify_refresh_token) localStorage.setItem('creds_spotify_refresh_token', data.spotify_refresh_token);
                            if (data.spotify_token_expiry) localStorage.setItem('creds_spotify_token_expiry', data.spotify_token_expiry);
                            if (data.spotify_cookie) localStorage.setItem('creds_spotify_cookie', data.spotify_cookie);
                            if (data.spotify_client_id) localStorage.setItem('creds_spotify_client_id', data.spotify_client_id);
                            if (data.spotify_client_secret) localStorage.setItem('creds_spotify_client_secret', data.spotify_client_secret);
                            if (data.arcod_token) localStorage.setItem('creds_arcod_token', data.arcod_token);
                            if (data.youtube_token) localStorage.setItem('creds_youtube_cookie', data.youtube_token);
                        }
                    } catch (e) {
                        console.error('Failed to load integrations', e);
                    }
                }

                setUser(session?.user ?? null);
                setLoading(false);
                (window as any).__bubbleUser = session?.user ?? null;
                window.dispatchEvent(new CustomEvent('bubble:authReady', { detail: { user: session?.user ?? null } }));
            });

            supabase.auth.onAuthStateChange((_event, session) => {
                setUser((prev: any) => {
                    if (prev?.id === session?.user?.id) return prev;
                    return session?.user ?? null;
                });
                (window as any).__bubbleUser = session?.user ?? null;
            });
        }).catch((err) => {
            console.warn('[Bubble Web] Supabase not configured:', err.message);
            setLoading(false);
        });
    }, []);

    // Init Bubble app after mount (scripts are loaded via defer in layout.tsx)
    useEffect(() => {
        if (!loading) {
            let attempts = 0;
            const maxAttempts = 30; // 30 * 200ms = 6 seconds max wait
            let timer: ReturnType<typeof setInterval>;

            const tryInit = () => {
                attempts++;
                const BubbleApp = (window as any).BubbleApp;
                const BubbleRouter = (window as any).BubbleRouter;

                if (typeof BubbleApp !== 'undefined' && typeof BubbleApp.init === 'function') {
                    clearInterval(timer);
                    console.log('[Bubble Web] Initializing app (attempt ' + attempts + ')');
                    BubbleApp.init().catch((err: any) => {
                        console.error('[Bubble Web] App init failed:', err);
                    });
                } else if (attempts >= maxAttempts) {
                    clearInterval(timer);
                    console.error('[Bubble Web] Failed to initialize after ' + maxAttempts + ' attempts. Scripts may not have loaded.');
                    console.error('[Bubble Web] BubbleApp:', typeof BubbleApp, 'BubbleRouter:', typeof BubbleRouter);
                }
            };

            // Try immediately first (scripts may already be loaded)
            tryInit();

            // Then poll every 200ms
            if (typeof (window as any).BubbleApp === 'undefined') {
                timer = setInterval(tryInit, 200);
            }

            return () => { if (timer) clearInterval(timer); };
        }
    }, [loading]);

    if (loading) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100vh', background: '#0a0a0a', color: '#b3b3b3', flexDirection: 'column', gap: '16px'
            }}>
                <div style={{
                    width: '40px', height: '40px', border: '3px solid #1a1a1a',
                    borderTopColor: '#1ed760', borderRadius: '50%',
                    animation: 'bubble-spin 0.8s linear infinite'
                }} />
                <span style={{ fontSize: '13px' }}>Loading Bubble...</span>
                <style>{`@keyframes bubble-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return (
        <>
            {/* ═══ Web Header Bar ═══ */}
            <header id="web-auth-bar" style={{
                position: 'fixed', top: 0, left: 0, right: 0, height: '40px',
                background: '#121212', display: 'flex', alignItems: 'center',
                justifyContent: 'flex-end', padding: '0 16px', zIndex: 1000,
                borderBottom: '1px solid rgba(255,255,255,0.08)', gap: '8px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: 'auto' }}>
                    <img src="/assets/icon.png" width="20" height="20" style={{ borderRadius: '5px', objectFit: 'cover' }} alt="Bubble" />
                    <span style={{ fontWeight: 700, fontSize: '13px', color: '#fff' }}>Bubble</span>
                    <span style={{ fontSize: '11px', color: 'var(--accent, #1ed760)', background: 'rgba(30,215,96,0.1)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>Web</span>
                </div>
                {user ? (
                    <>
                        <span style={{ fontSize: '12px', color: '#b3b3b3', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1ed760', display: 'inline-block' }} />
                            {user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0]}
                        </span>
                        <button
                            onClick={async () => {
                                const sb = (window as any).__bubbleSupabase;
                                if (sb) await sb.auth.signOut();
                                window.location.reload();
                            }}
                            style={{
                                fontSize: '11px', padding: '4px 12px',
                                borderRadius: '6px', background: '#1a1a1a',
                                color: '#b3b3b3', border: '1px solid #242424', cursor: 'pointer'
                            }}
                        >
                            Sign Out
                        </button>
                    </>
                ) : (
                    <Link
                        href="/login"
                        style={{
                            fontSize: '12px', padding: '5px 14px',
                            borderRadius: '6px', background: '#1ed760',
                            color: '#000', fontWeight: 600, textDecoration: 'none'
                        }}
                    >
                        Sign In
                    </Link>
                )}
            </header>

            <div style={{ position: 'fixed', bottom: 10, left: 10, zIndex: 9999, background: 'rgba(255,0,0,0.8)', padding: '10px', color: 'white', fontSize: '12px', fontFamily: 'monospace' }}>
                <div id="debug-bubble-app">BubbleApp: ?</div>
                <div id="debug-bubble-router">BubbleRouter: ?</div>
                <div id="debug-error-log">Errors:</div>
                <script dangerouslySetInnerHTML={{
                    __html: `
                        window.addEventListener('error', e => {
                            const d = document.getElementById('debug-error-log');
                            if(d) d.innerHTML += '<br>' + e.message;
                        });
                        setInterval(() => {
                            const a = document.getElementById('debug-bubble-app');
                            if(a) a.innerText = 'BubbleApp: ' + typeof window.BubbleApp;
                            const r = document.getElementById('debug-bubble-router');
                            if(r) r.innerText = 'BubbleRouter: ' + typeof window.BubbleRouter;
                        }, 1000);
                    `
                }} />
            </div>

            {/* ═══ Main App Layout (1:1 parity with Desktop index.html) ═══ */}
            <div id="app-container" className="app-container" ref={containerRef}>
                {/* ── Sidebar ── */}
                <nav id="sidebar" className="sidebar">
                    <div className="sidebar-nav">
                        <button className="nav-item active" data-route="home" id="nav-home">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                <polyline points="9 22 9 12 15 12 15 22" />
                            </svg>
                            <span>Home</span>
                        </button>
                        <button className="nav-item" data-route="library" id="nav-library">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                            <span>Library</span>
                        </button>
                        <button className="nav-item" data-route="search" id="nav-search">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <span>Search</span>
                        </button>
                        <button className="nav-item" data-route="queue" id="nav-queue">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                                <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                            </svg>
                            <span>Queue</span>
                        </button>
                        <button className="nav-item" data-route="lyrics" id="nav-lyrics">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                            </svg>
                            <span>Lyrics</span>
                        </button>
                        <button className="nav-item" data-route="sync" id="nav-sync">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                            </svg>
                            <span>Sync</span>
                        </button>
                        <button className="nav-item" data-route="downloads" id="nav-downloads">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            <span>Downloads</span>
                        </button>
                    </div>

                    <div className="sidebar-playlists" id="sidebar-playlists">
                        <button className="nav-item sidebar-liked" id="nav-liked" style={{ width: '100%', marginBottom: '4px' }}
                            onClick={() => (window as any).BubbleRouter?.navigate('library', { filter: 'liked', force: true })}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                            </svg>
                            <span>Liked Songs</span>
                            <span id="liked-count" style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-tertiary)' }}></span>
                        </button>
                        <div className="sidebar-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => (window as any).BubbleLibrary?.togglePlaylistsSection?.()}>
                                <svg id="pl-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transition: 'transform 0.2s', transform: 'rotate(90deg)' }}>
                                    <polyline points="9 18 15 12 9 6" />
                                </svg>
                                Playlists
                            </div>
                            <button
                                style={{
                                    padding: '2px 6px',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    lineHeight: '1',
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    borderRadius: '4px',
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer'
                                }}
                                title="Create Bubble Playlist"
                                onClick={(e) => { e.stopPropagation(); (window as any).BubbleApp?.showCreatePlaylistModal?.(); }}
                            >
                                +
                            </button>
                        </div>
                        <div id="playlist-list" className="playlist-list">
                            {/* Playlists rendered by JS */}
                        </div>
                    </div>

                    <div className="sidebar-bottom">
                        <button className="nav-item" data-route="settings" id="nav-settings">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                            <span>Settings</span>
                        </button>
                    </div>
                </nav>

                {/* ── Content Area ── */}
                <main id="content" className="content">
                    <div id="view-container" className="view-container">
                        {/* Views rendered by BubbleRouter */}
                    </div>
                </main>
            </div>

            {/* ═══ Player Bar (Desktop Parity) ═══ */}
            <footer id="player-bar" className="player-bar">
                <div className="player-track-info">
                    <div id="player-artwork" className="player-artwork">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
                            <path d="M9 18V5l12-2v13" />
                            <circle cx="6" cy="18" r="3" />
                            <circle cx="18" cy="16" r="3" />
                        </svg>
                    </div>
                    <div className="player-meta">
                        <div id="player-title" className="player-title">
                            <span className="player-title-inner">No track playing</span>
                        </div>
                        <div id="player-artist" className="player-artist">—</div>
                        <div id="player-source-badge" className="player-source-badge" style={{ display: 'none' }}>
                            <span id="player-source-dot" className="source-dot"></span>
                            <span id="player-source-label">Source</span>
                            <span id="player-quality-pill" className="quality-pill">FLAC</span>
                        </div>
                    </div>
                </div>

                <div className="player-controls">
                    <div className="player-buttons">
                        <button id="btn-like" className="player-btn player-btn-like" aria-label="Like track">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                            </svg>
                        </button>
                        <button id="btn-shuffle" className="player-btn" aria-label="Shuffle">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
                                <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
                                <line x1="4" y1="4" x2="9" y2="9" />
                            </svg>
                        </button>
                        <button id="btn-prev" className="player-btn" aria-label="Previous">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                            </svg>
                        </button>
                        <button id="btn-play" className="player-btn player-btn-play" aria-label="Play">
                            <svg id="icon-play" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                            <svg id="icon-pause" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'none' }}>
                                <rect x="6" y="4" width="4" height="16" />
                                <rect x="14" y="4" width="4" height="16" />
                            </svg>
                        </button>
                        <button id="btn-next" className="player-btn" aria-label="Next">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                            </svg>
                        </button>
                        <button id="btn-repeat" className="player-btn" aria-label="Repeat">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                                <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                            </svg>
                        </button>
                        <button id="btn-radio" className="player-btn" aria-label="Auto Radio" title="Auto-radio similar songs">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5" />
                                <circle cx="17" cy="7" r="1" />
                            </svg>
                        </button>
                        <button id="btn-add-playlist" className="player-btn" aria-label="Add to Playlist" title="Add to Bubble Playlist">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                        </button>
                    </div>
                    <div className="player-progress">
                        <span id="player-time-current" className="player-time">0:00</span>
                        <div id="progress-bar" className="progress-bar">
                            <div id="progress-fill" className="progress-fill"></div>
                            <div id="progress-handle" className="progress-handle"></div>
                        </div>
                        <span id="player-time-total" className="player-time">0:00</span>
                    </div>
                </div>

                <div className="player-extra">
                    <button id="btn-queue" className="player-btn" aria-label="Queue" title="Queue & Lyrics">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                            <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                        </svg>
                    </button>
                    <button id="btn-nowplaying" className="player-btn" aria-label="Now Playing" title="Now Playing">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                        </svg>
                    </button>
                    <div className="player-volume">
                        <button id="btn-volume" className="player-btn" aria-label="Volume">
                            <svg id="icon-volume" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            </svg>
                        </button>
                        <div id="volume-bar" className="volume-bar">
                            <div id="volume-fill" className="volume-fill" style={{ width: '80%' }}></div>
                            <div id="volume-handle" className="volume-handle" style={{ left: '80%' }}></div>
                        </div>
                    </div>
                </div>
            </footer>

            {/* ═══ Full-Screen Now Playing Player Overlay (1:1 Desktop Parity) ═══ */}
            <div id="nowplaying-overlay" className="nowplaying-overlay hidden">
                <button id="btn-close-np" className="np-close-btn" aria-label="Close Now Playing">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="4 14 10 14 10 20" />
                        <polyline points="20 10 14 10 14 4" />
                        <line x1="14" y1="10" x2="21" y2="3" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                </button>

                <div className="np-layout">
                    {/* Left Column: Artwork + Info + Controls stacked vertically */}
                    <div className="np-left-col">
                        <div className="np-artwork-section">
                            <div id="np-artwork-large" className="np-artwork-large">
                                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.2">
                                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                                </svg>
                            </div>
                            <div id="np-artwork-shadow" className="np-artwork-shadow"></div>
                        </div>

                        <div className="np-info-section">
                            <div id="np-track-title" className="np-track-title">No track playing</div>
                            <div id="np-track-artist" className="np-track-artist">—</div>
                            <div id="np-track-album" className="np-track-album"></div>

                            <div className="np-badges" id="np-badges"></div>

                            <div className="np-progress-section">
                                <span id="np-time-current" className="np-time-current">0:00</span>
                                <div id="np-progress-bar" className="np-progress-bar">
                                    <div id="np-progress-fill" className="np-progress-fill"></div>
                                    <div id="np-progress-handle" className="np-progress-handle"></div>
                                </div>
                                <span id="np-time-total" className="np-time-total">0:00</span>
                            </div>

                            <div className="np-controls">
                                <button id="np-btn-shuffle" className="np-ctrl-btn" title="Shuffle">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
                                        <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
                                        <line x1="4" y1="4" x2="9" y2="9" />
                                    </svg>
                                </button>
                                <button id="np-btn-prev" className="np-ctrl-btn" title="Previous">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                                    </svg>
                                </button>
                                <button id="np-btn-play" className="np-ctrl-btn np-ctrl-btn-play" title="Play / Pause">
                                    <svg id="np-icon-play" width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                                        <polygon points="5 3 19 12 5 21 5 3" />
                                    </svg>
                                    <svg id="np-icon-pause" width="32" height="32" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'none' }}>
                                        <rect x="6" y="4" width="4" height="16" />
                                        <rect x="14" y="4" width="4" height="16" />
                                    </svg>
                                </button>
                                <button id="np-btn-next" className="np-ctrl-btn" title="Next">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                                    </svg>
                                </button>
                                <button id="np-btn-repeat" className="np-ctrl-btn" title="Repeat">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                                        <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                                    </svg>
                                </button>
                            </div>

                            <div className="np-actions">
                                <button id="np-btn-like" className="np-ctrl-btn" title="Like">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                    </svg>
                                </button>
                                <button id="np-btn-download" className="np-ctrl-btn" title="Download FLAC">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                </button>
                            </div>

                            <div className="np-volume">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                </svg>
                                <div id="np-volume-bar" className="np-volume-bar">
                                    <div id="np-volume-fill" className="np-volume-fill" style={{ width: '80%' }}></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Queue + Lyrics side by side */}
                    <div className="np-right-col">
                        <div className="np-queue-section" id="np-queue-section">
                            <div className="np-queue-header">
                                <span>Up Next</span>
                                <button id="np-btn-clear-queue" className="np-queue-clear" title="Clear Queue">Clear</button>
                            </div>
                            <div className="np-queue-list" id="np-queue-list"></div>
                        </div>
                        <div className="np-lyrics-section" id="np-lyrics-section">
                            <div className="np-lyrics-scroll" id="np-lyrics-scroll">
                                <div className="np-lyrics-placeholder">Loading lyrics...</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ Toast Notification Container ═══ */}
            <div id="toast-container" className="toast-container"></div>
        </>
    );
}
