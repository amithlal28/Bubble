import { execFile, execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const ARCOD_SUPABASE_URL = 'https://fnlghyzwyoklfqyhqlav.supabase.co';
const ARCOD_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubGdoeXp3eW9rbGZxeWhxbGF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDExODAsImV4cCI6MjA4OTY3NzE4MH0.9J1-JK1jJYunBM6bF-_MLR5UvhDV4BibXordTOzH2_0';
const ARCOD_API_BASE = 'https://arcod.xyz/api';
const ARCOD_STASH_BASE = 'https://api.arcod.xyz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

let _arcodSession: any = null;
let _arcodPromise: any = null;

// No env-var dependency — each user brings their own ARCOD token via the
// x-arcod-token header (stored in localStorage by the polyfill).  The
// server-side session below is only a zero-config anonymous fallback so
// that search & streaming work even before a user connects their account.

async function getArcodSession() {
    if (_arcodSession && _arcodSession.expiresAt > Date.now() + 60000) return _arcodSession;
    if (_arcodPromise) return _arcodPromise;
    _arcodPromise = (async () => {
        // If we already have a refresh token from a previous signup, reuse it
        if (_arcodSession?.refreshToken) {
            try {
                const res = await fetch(`${ARCOD_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': ARCOD_ANON_KEY },
                    body: JSON.stringify({ refresh_token: _arcodSession.refreshToken }),
                });
                if (res.ok) {
                    const d: any = await res.json();
                    _arcodSession = { accessToken: d.access_token, refreshToken: d.refresh_token, expiresAt: Date.now() + (d.expires_in || 3600) * 1000 };
                    return _arcodSession;
                }
            } catch (e: any) { /* fall through to signup */ }
        }

        // Auto-signup a new anonymous session (zero-config, no env vars needed)
        try {
            const res = await fetch(`${ARCOD_SUPABASE_URL}/auth/v1/signup`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': ARCOD_ANON_KEY },
                body: JSON.stringify({ email: `wb_${Date.now()}@bbl.local`, password: 'bbl-web-stream' }),
            });
            if (res.ok) {
                const d: any = await res.json();
                _arcodSession = { accessToken: d.access_token, refreshToken: d.refresh_token, expiresAt: Date.now() + (d.expires_in || 3600) * 1000 };
                return _arcodSession;
            }
            console.warn('[ARCOD] Signup failed:', res.status);
        } catch (e: any) { console.warn('[ARCOD] Signup error:', e.message); }

        _arcodPromise = null;
        return null;
    })();
    return _arcodPromise;
}

function norm(s: string) { return (s || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\b(feat\.?|ft\.?|featuring)\b.*/gi, ' ').replace(/[''`]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(); }

function jaccard(a: string, b: string) {
    const sa = new Set(a.split(' ').filter(Boolean)), sb = new Set(b.split(' ').filter(Boolean));
    if (!sa.size || !sb.size) return 0;
    let int = 0; for (const x of sa) { if (sb.has(x)) int++; }
    return int / new Set([...sa, ...sb]).size;
}

async function searchArcod(q: string, token: string | null = null) {
    try {
        const headers: any = { Accept: 'application/json', Origin: 'https://arcod.xyz', Referer: 'https://arcod.xyz/', 'User-Agent': UA };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const r = await fetch(`${ARCOD_API_BASE}/get-music?q=${encodeURIComponent(q)}&offset=0`, { headers, signal: AbortSignal.timeout(10000) });
        if (!r.ok) return [];
        const d: any = await r.json();
        return d?.data?.tracks?.items || d?.tracks?.items || [];
    } catch { return []; }
}

async function arcodFastStream(trackId: string, stashKey: string) {
    if (!stashKey) return null;
    try {
        const r = await fetch(`${ARCOD_STASH_BASE}/v2/stash/stream/${trackId}?quality=27`, { headers: { Accept: 'application/json', Origin: 'https://arcod.xyz', Referer: 'https://arcod.xyz/', 'User-Agent': UA, 'X-Stash-Key': stashKey }, signal: AbortSignal.timeout(15000) });
        if (!r.ok) return null;
        const body = (await r.text()).trim();
        if (body.startsWith('http')) return body;
        try { const j: any = JSON.parse(body); return (j.data || j).url || (j.data || j).streamUrl || null; } catch { return null; }
    } catch { return null; }
}

async function arcodJobStream(trackId: string, title: string, artist: string, userToken?: string) {
    try {
        // Use user-provided token if available, otherwise auto-generate
        let session = userToken ? { accessToken: userToken } : await getArcodSession();
        const h: any = { 'Content-Type': 'application/json', Origin: 'https://arcod.xyz', Referer: 'https://arcod.xyz/', 'User-Agent': UA };
        if (session?.accessToken) h['Authorization'] = 'Bearer ' + session.accessToken;

        const r = await fetch(`${ARCOD_API_BASE}/v2/downloads`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ albumId: '0000000000000', trackId, albumTitle: title || 'Single', artistName: artist || 'Artist', artistId: '0', coverUrl: '', releaseDate: '', tracksCount: 1, quality: 27, format: 'FLAC', bitrate: 320, embedLyrics: false, lyricsMode: 'none', downloadBooklet: false, attachCover: false, zipName: '{track} - {name}', trackName: '{track} - {name}' }),
            signal: AbortSignal.timeout(20000),
        });
        if (!r.ok) return null;
        const d: any = await r.json();
        const url = d?.downloadUrl || d?.url;
        if (url) return url;
        const jobId = d?.id || d?.jobId;
        if (!jobId) return null;

        const ph: any = { Accept: 'application/json', 'Content-Type': 'application/json', Origin: 'https://arcod.xyz', Referer: 'https://arcod.xyz/', 'User-Agent': UA };
        if (session?.accessToken) ph['Authorization'] = 'Bearer ' + session.accessToken;

        for (let i = 0; i < 8; i++) {
            await new Promise(r => setTimeout(r, 800));
            const p = await fetch(`${ARCOD_API_BASE}/v2/downloads/${jobId}`, { headers: ph, signal: AbortSignal.timeout(10000) });
            if (!p.ok) continue;
            const pd: any = await p.json();
            if (pd?.downloadUrl || pd?.url) return pd.downloadUrl || pd.url;
            if (pd?.status === 'completed' || pd?.state === 'completed') {
                const u = await fetch(`${ARCOD_API_BASE}/v2/downloads/${jobId}/url`, {
                    method: 'POST',
                    headers: ph,
                    body: JSON.stringify({}),
                    signal: AbortSignal.timeout(10000)
                });
                if (u.ok) {
                    const ud: any = await u.json();
                    if (ud?.downloadUrl) return ud.downloadUrl;
                }
            }
            if (pd?.status === 'failed' || pd?.state === 'failed') break;
        }
        return null;
    } catch { return null; }
}

function youtubeStream(track: any): Promise<string | null> {
    const ytdlp = findYtDlp();
    if (!ytdlp) return Promise.resolve(null);
    const isYT = track.source === 'youtube' || (track.id && track.id.startsWith('yt_'));
    const vid = isYT ? (track.source_id || track.id.replace('yt_', '')) : null;
    const target = vid ? `https://www.youtube.com/watch?v=${vid}` : `ytsearch1:${track.artist} - ${track.title}`;
    return new Promise(resolve => {
        execFile(ytdlp as string, ['-g', '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best', '--no-playlist', target], { timeout: 30000 }, (err: any, stdout: string) => {
            if (err || !stdout) return resolve(null);
            const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
            resolve(lines[0] || null);
        });
    });
}

function findYtDlp() {
    const candidates = [
        path.join(process.cwd(), '..', 'bin', 'yt-dlp.exe'),
        path.join(process.cwd(), 'bin', 'yt-dlp.exe'),
        path.join(process.env.APPDATA || '', 'bubble', 'bin', 'yt-dlp.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'bubble', 'bin', 'yt-dlp.exe'),
        'yt-dlp.exe', 'yt-dlp',
    ];
    for (const c of candidates) {
        if (c === 'yt-dlp' || c === 'yt-dlp.exe') {
            try { execFileSync(c, ['--version'], { timeout: 5000 }); return c; } catch { continue; }
        }
        if (fs.existsSync(c)) return c;
    }
    return null;
}

// SoundCloud client ID (public, embedded in their web player — stable)
const SOUNDCLOUD_CLIENT_ID = 'iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX';

async function fetchSoundCloudStream(track: any): Promise<string | null> {
    try {
        const query = encodeURIComponent(`${track.artist || ''} ${track.title || ''}`.trim());
        if (!query) return null;

        const sr = await fetch(
            `https://api-v2.soundcloud.com/search/tracks?q=${query}&limit=5&client_id=${SOUNDCLOUD_CLIENT_ID}`,
            { signal: AbortSignal.timeout(5000) }
        );
        if (!sr.ok) return null;
        const data: any = await sr.json();
        const tracks = data?.collection || [];

        // Match by title/artist similarity
        const nqt = norm(track.title), nqa = norm(track.artist);
        let best: any = null, bestS = 0.4;
        for (const t of tracks) {
            const s = jaccard(nqt, norm(t.title || '')) * 0.6 + jaccard(nqa, norm(t.user?.username || ''));
            if (s > bestS) { bestS = s; best = t; }
        }

        if (best?.stream_url) {
            const url = best.stream_url + '?client_id=' + SOUNDCLOUD_CLIENT_ID;
            // Verify the stream is accessible
            const test = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { Range: 'bytes=0-0' } });
            if (test.ok || test.status === 206) return url;
        }
    } catch (_) { }
    return null;
}

async function fetchOnlineYouTubeStream(track: any): Promise<string | null> {
    try {
        const query = encodeURIComponent(`${track.artist || ''} - ${track.title || ''}`.trim());
        if (!query || query === '-') return null;

        // Piped API instances (privacy-friendly YouTube frontend)
        const pipedInstances = [
            'https://api.piped.private.coffee',
            'https://pipedapi.kavin.rocks',
            'https://pipedapi.adminforge.de',
            'https://pipedapi.leptons.xyz',
            'https://pipedapi.astartes.cloud',
            'https://pipedapi.syncpundit.io',
            'https://pipedapi.moomoo.me',
            'https://pipedapi.smnz.de',
        ];

        // Try Piped first
        for (const base of pipedInstances) {
            try {
                const sr = await fetch(`${base}/search?q=${query}&filter=videos`, { signal: AbortSignal.timeout(4000) });
                if (!sr.ok) continue;
                const sd: any = await sr.json();
                const items = sd.items || [];
                const first = items.find((it: any) => it.type === 'stream' || it.url);
                if (!first) continue;
                const videoId = first.url ? first.url.replace('/watch?v=', '') : (first.id || '');
                if (!videoId) continue;

                const vr = await fetch(`${base}/streams/${videoId}`, { signal: AbortSignal.timeout(5000) });
                if (!vr.ok) continue;
                const vd: any = await vr.json();
                const audios = vd.audioStreams || [];
                if (audios.length) {
                    const best = audios.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
                    if (best?.url) {
                        // Piped returns relative URLs. The API is on `pipedapi.x.com` or
                        // `api.piped.x.com` but the video proxy is on `piped.x.com`.
                        // Derive the proxy base from the API base.
                        let proxyBase = base;
                        try {
                            const u = new URL(base);
                            if (u.hostname.startsWith('pipedapi.')) {
                                u.hostname = u.hostname.replace('pipedapi.', 'piped.');
                            } else if (u.hostname.startsWith('api.piped.')) {
                                u.hostname = u.hostname.replace('api.piped.', 'piped.');
                            }
                            proxyBase = u.origin;
                        } catch (_) { /* keep original base */ }
                        const audioUrl = best.url.startsWith('http') ? best.url : new URL(best.url, proxyBase).href;
                        return audioUrl;
                    }
                }
            } catch (e) { }
        }

        // Fallback: Invidious instances
        const invidiousInstances = [
            'https://inv.nadeko.net',
            'https://invidious.fdn.fr',
            'https://invidious.privacyredirect.com',
            'https://vid.puffyan.us',
            'https://yewtu.be',
        ];
        for (const base of invidiousInstances) {
            try {
                const sr = await fetch(`${base}/api/v1/search?q=${query}&type=video`, { signal: AbortSignal.timeout(4000) });
                if (!sr.ok) continue;
                const items: any[] = await sr.json();
                const first = items.find((it: any) => it.videoId || it.url);
                if (!first) continue;
                const videoId = first.videoId || (first.url ? first.url.split('v=')[1] : '');
                if (!videoId) continue;

                const vr = await fetch(`${base}/api/v1/videos/${videoId}`, { signal: AbortSignal.timeout(5000) });
                if (!vr.ok) continue;
                const vd: any = await vr.json();
                const audios = vd.adaptiveFormats?.filter((f: any) => f.type?.startsWith('audio')) || [];
                if (audios.length) {
                    const best = audios.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
                    if (best?.url) {
                        const audioUrl = best.url.startsWith('http') ? best.url : new URL(best.url, base).href;
                        return audioUrl;
                    }
                }
            } catch (e) { }
        }
    } catch { }
    return null;
}

export async function POST(request: Request) {
    let arcodError: string | null = null;

    try {
        const body = await request.json();
        const { track, preferSource, disableLossless: bodyDisableLossless } = body;
        if (!track) return Response.json({ error: 'Track metadata required' }, { status: 400 });

        const headerDisableLossless = request.headers.get('x-disable-lossless') === 'true';
        const headerPreferSource = request.headers.get('x-prefer-source') || '';
        const disableLossless = bodyDisableLossless || headerDisableLossless || preferSource === 'youtube' || headerPreferSource === 'youtube';

        // Use user-provided ARCOD token if available
        const userToken = request.headers.get('x-arcod-token') || '';
        const stashKey = request.headers.get('x-arcod-stash-key') || process.env.ARCOD_STASH_KEY || '';

        // If Lossless is NOT disabled, try ARCOD first
        if (!disableLossless) {
            try {
                // 1. If track already has ARCOD ID, try direct streams first
                const aid = track.arcod_id || (track.source === 'arcod' ? track.source_id : null);
                if (aid) {
                    const u = await arcodFastStream(aid, stashKey) || await arcodJobStream(aid, track.title, track.artist, userToken);
                    if (u) return Response.json({ url: u, source: 'arcod', quality: track.quality || '24-Bit FLAC (Qobuz via ARCOD)' });
                }

                // 2. Search ARCOD catalog and match (try multiple query variations)
                const session = await getArcodSession();
                const activeToken = userToken || session?.accessToken || null;

                let results: any[] = [];
                const cleanQuery = `${track.title || ''} ${track.artist || ''}`.replace(/\s+/g, ' ').trim();
                const simpleQuery = `${(track.title || '').split('(')[0].trim()} ${(track.artist || '').split(',')[0].trim()}`.trim();

                results = await searchArcod(cleanQuery, activeToken);
                if (!results.length && simpleQuery !== cleanQuery) {
                    results = await searchArcod(simpleQuery, activeToken);
                }
                if (!results.length) {
                    results = await searchArcod((track.title || '').split('(')[0].split('-')[0].trim(), activeToken);
                }

                if (results.length) {
                    const nqt = norm(track.title), nqa = norm(track.artist);
                    let best: any = null, bestS = 0.25;
                    for (const c of results) {
                        const ct = c.title || c.name || '', ca = (c.artist?.name || c.performer?.name || '');
                        const s = jaccard(nqt, norm(ct)) * 0.6 + jaccard(nqa, norm(ca)) * 0.4;
                        if (s > bestS) { bestS = s; best = c; }
                    }
                    if (best) {
                        const mid = String(best.id || best.track_id || '');
                        const u = await arcodFastStream(mid, stashKey) || await arcodJobStream(mid, best.title || track.title, best.performer?.name || track.artist, activeToken);
                        if (u) return Response.json({ url: u, source: 'arcod', quality: '24-Bit FLAC (Qobuz via ARCOD)' });
                    }
                }
            } catch (e: any) {
                arcodError = e.message || 'ARCOD error';
                console.warn('[Stream] ARCOD block threw, falling back to YouTube:', arcodError);
            }
        }

        // 3. Fallbacks: SoundCloud → YouTube (Piped/Invidious)
        const yt = (await fetchSoundCloudStream(track))
            || (await youtubeStream(track))
            || (await fetchOnlineYouTubeStream(track));
        if (yt) {
            const isSC = yt.includes('soundcloud.com');
            return Response.json({
                url: yt,
                source: isSC ? 'soundcloud' : 'youtube',
                quality: isSC ? 'AAC/MP3 (SoundCloud)' : 'AAC/Opus (YouTube Music)'
            });
        }

        return Response.json({
            error: arcodError ? `Lossless failed (${arcodError}), YouTube fallback also failed` : 'No stream found'
        }, { status: 404 });
    } catch (e: any) {
        return Response.json({ error: 'Stream resolution failed: ' + (e.message || 'unknown') }, { status: 500 });
    }
}
