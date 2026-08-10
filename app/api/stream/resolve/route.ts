import { createClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ARCOD_SUPABASE_URL = 'https://fnlghyzwyoklfqyhqlav.supabase.co';
// ARCOD project's public anon key (same class as any Supabase anon key — safe to ship).
const ARCOD_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubGdoeXp3eW9rbGZxeWhxbGF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDExODAsImV4cCI6MjA4OTY3NzE4MH0.9J1-JK1jJYunBM6bF-_MLR5UvhDV4BibXordTOzH2_0';
const ARCOD_API_BASE = 'https://arcod.xyz/api';
const ARCOD_STASH_BASE = 'https://api.arcod.xyz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const SOUNDCLOUD_CLIENT_ID = 'iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX';

// Wrap every upstream media URL so the browser <audio> pulls it same-origin.
// The proxy injects the headers ARCOD needs and defeats YouTube's IP-locking.
function proxied(url: string) {
    return `/api/stream/proxy?url=${encodeURIComponent(url)}`;
}

function norm(s: string) { return (s || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\b(feat\.?|ft\.?|featuring)\b.*/gi, ' ').replace(/[''`]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(); }

function jaccard(a: string, b: string) {
    const sa = new Set(a.split(' ').filter(Boolean)), sb = new Set(b.split(' ').filter(Boolean));
    if (!sa.size || !sb.size) return 0;
    let int = 0; for (const x of sa) { if (sb.has(x)) int++; }
    return int / new Set([...sa, ...sb]).size;
}
async function refreshArcodToken(refreshToken: string) {
    try {
        const res = await fetch(`${ARCOD_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: ARCOD_ANON_KEY },
            body: JSON.stringify({ refresh_token: refreshToken }),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const d: any = await res.json();
        if (!d.access_token) return null;
        return {
            accessToken: d.access_token,
            refreshToken: d.refresh_token || refreshToken,
            expiresAt: Date.now() + (d.expires_in || 3600) * 1000,
        };
    } catch { return null; }
}

// Load the caller's own ARCOD creds from user_integrations (the cross-device
// source of truth), refreshing + writing the token back when near expiry so it
// works indefinitely. Header overrides win when present (single-device paste).
async function getUserArcodCreds(hdrToken: string, hdrStash: string) {
    let token: string | null = hdrToken || null;
    let stashKey: string | null = hdrStash || null;
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase
                .from('user_integrations')
                .select('arcod_token, arcod_refresh_token, arcod_token_expiry, arcod_stashkey')
                .eq('user_id', user.id)
                .single();
            if (data) {
                if (!token) token = data.arcod_token || null;
                if (!stashKey) stashKey = data.arcod_stashkey || null;
                const nearExpiry = data.arcod_token_expiry && Number(data.arcod_token_expiry) < Date.now() + 60000;
                if (!hdrToken && data.arcod_refresh_token && nearExpiry) {
                    const r = await refreshArcodToken(data.arcod_refresh_token);
                    if (r) {
                        token = r.accessToken;
                        await supabase.from('user_integrations').update({
                            arcod_token: r.accessToken,
                            arcod_refresh_token: r.refreshToken,
                            arcod_token_expiry: r.expiresAt,
                            updated_at: new Date().toISOString(),
                        }).eq('user_id', user.id);
                    }
                }
            }
        }
    } catch { /* fall back to header token / anon */ }
    return { token, stashKey };
}
async function searchArcod(q: string, token: string | null = null) {
    try {
        const headers: any = { Accept: 'application/json', Origin: 'https://arcod.xyz', Referer: 'https://arcod.xyz/', 'User-Agent': UA };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const r = await fetch(`${ARCOD_API_BASE}/get-music?q=${encodeURIComponent(q)}&offset=0`, { headers, signal: AbortSignal.timeout(9000) });
        if (!r.ok) return [];
        const d: any = await r.json();
        return d?.data?.tracks?.items || d?.tracks?.items || [];
    } catch { return []; }
}

async function arcodFastStream(trackId: string, stashKey: string | null) {
    if (!stashKey) return null;
    try {
        const r = await fetch(`${ARCOD_STASH_BASE}/v2/stash/stream/${trackId}?quality=27`, { headers: { Accept: 'application/json', Origin: 'https://arcod.xyz', Referer: 'https://arcod.xyz/', 'User-Agent': UA, 'X-Stash-Key': stashKey }, signal: AbortSignal.timeout(12000) });
        if (!r.ok) return null;
        const body = (await r.text()).trim();
        if (body.startsWith('http')) return body;
        try { const j: any = JSON.parse(body); return (j.data || j).url || (j.data || j).streamUrl || null; } catch { return null; }
    } catch { return null; }
}

// Poll the ARCOD job endpoint but stop once the shared deadline is hit so the
// serverless function never blows past the Hobby cap.
async function arcodJobStream(trackId: string, title: string, artist: string, userToken: string | null, deadline: number) {
    try {
        const h: any = { 'Content-Type': 'application/json', Origin: 'https://arcod.xyz', Referer: 'https://arcod.xyz/', 'User-Agent': UA };
        if (userToken) h['Authorization'] = 'Bearer ' + userToken;

        const r = await fetch(`${ARCOD_API_BASE}/v2/downloads`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ albumId: '0000000000000', trackId, albumTitle: title || 'Single', artistName: artist || 'Artist', artistId: '0', coverUrl: '', releaseDate: '', tracksCount: 1, quality: 27, format: 'FLAC', bitrate: 320, embedLyrics: false, lyricsMode: 'none', downloadBooklet: false, attachCover: false, zipName: '{track} - {name}', trackName: '{track} - {name}' }),
            signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) return null;
        const d: any = await r.json();
        const url = d?.downloadUrl || d?.url;
        if (url) return url;
        const jobId = d?.id || d?.jobId;
        if (!jobId) return null;

        const ph: any = { Accept: 'application/json', 'Content-Type': 'application/json', Origin: 'https://arcod.xyz', Referer: 'https://arcod.xyz/', 'User-Agent': UA };
        if (userToken) ph['Authorization'] = 'Bearer ' + userToken;

        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 800));
            if (Date.now() >= deadline) break;
            const p = await fetch(`${ARCOD_API_BASE}/v2/downloads/${jobId}`, { headers: ph, signal: AbortSignal.timeout(9000) });
            if (!p.ok) continue;
            const pd: any = await p.json();
            if (pd?.downloadUrl || pd?.url) return pd.downloadUrl || pd.url;
            if (pd?.status === 'completed' || pd?.state === 'completed') {
                const u = await fetch(`${ARCOD_API_BASE}/v2/downloads/${jobId}/url`, { method: 'POST', headers: ph, body: JSON.stringify({}), signal: AbortSignal.timeout(9000) });
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
// SoundCloud fallback — resolve a progressive transcoding (the old v1
// `stream_url` field is dead). Returns a CDN URL that needs no auth.
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

        const nqt = norm(track.title), nqa = norm(track.artist);
        let best: any = null, bestS = 0.4;
        for (const t of tracks) {
            const s = jaccard(nqt, norm(t.title || '')) * 0.6 + jaccard(nqa, norm(t.user?.username || ''));
            if (s > bestS) { bestS = s; best = t; }
        }
        if (!best) return null;

        const transcodings = best?.media?.transcodings || [];
        const prog = transcodings.find((t: any) => t?.format?.protocol === 'progressive') || transcodings[0];
        if (!prog?.url) return null;

        // The transcoding URL returns JSON { url } pointing at the actual CDN file.
        const rr = await fetch(`${prog.url}?client_id=${SOUNDCLOUD_CLIENT_ID}`, { signal: AbortSignal.timeout(5000) });
        if (!rr.ok) return null;
        const rd: any = await rr.json();
        return rd?.url || null;
    } catch (_) { }
    return null;
}

// YouTube fallback via Piped — trimmed to 2 instances with tight timeouts so it
// can never dominate the time budget. Returns an https media URL (proxied later).
async function fetchOnlineYouTubeStream(track: any, deadline: number): Promise<string | null> {
    const query = encodeURIComponent(`${track.artist || ''} - ${track.title || ''}`.trim());
    if (!query || query === '-') return null;

    const pipedInstances = ['https://pipedapi.kavin.rocks', 'https://api.piped.private.coffee'];
    for (const base of pipedInstances) {
        if (Date.now() > deadline) break;
        try {
            const sr = await fetch(`${base}/search?q=${query}&filter=videos`, { signal: AbortSignal.timeout(4000) });
            if (!sr.ok) continue;
            const sd: any = await sr.json();
            const first = (sd.items || []).find((it: any) => it.type === 'stream' || it.url);
            if (!first) continue;
            const videoId = first.url ? first.url.replace('/watch?v=', '') : (first.id || '');
            if (!videoId) continue;

            const vr = await fetch(`${base}/streams/${videoId}`, { signal: AbortSignal.timeout(5000) });
            if (!vr.ok) continue;
            const vd: any = await vr.json();
            const audios = vd.audioStreams || [];
            if (!audios.length) continue;
            const best = audios.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
            if (best?.url) return best.url; // Piped audio URLs are absolute googlevideo/proxy links
        } catch (_) { }
    }
    return null;
}

export async function POST(request: Request) {
    const deadline = Date.now() + 50000; // stay clear of the 60s hard cap
    let arcodError: string | null = null;

    try {
        const body = await request.json();
        const { track, preferSource, disableLossless: bodyDisableLossless, allowFallback: bodyAllowFallback } = body;
        if (!track) return Response.json({ error: 'Track metadata required' }, { status: 400 });

        const headerDisableLossless = request.headers.get('x-disable-lossless') === 'true';
        const headerPreferSource = request.headers.get('x-prefer-source') || '';
        const disableLossless = bodyDisableLossless || headerDisableLossless || preferSource === 'youtube' || headerPreferSource === 'youtube';
        // Fallback only runs when the client says it is enabled in settings.
        const allowFallback = bodyAllowFallback === true || request.headers.get('x-allow-fallback') === 'true';

        const { token: userToken, stashKey } = await getUserArcodCreds(
            request.headers.get('x-arcod-token') || '',
            request.headers.get('x-arcod-stash-key') || process.env.ARCOD_STASH_KEY || ''
        );

        // ── Lossless first (unless explicitly disabled) ──
        if (!disableLossless) {
            try {
                const aid = track.arcod_id || (track.source === 'arcod' ? track.source_id : null);
                if (aid) {
                    const u = await arcodFastStream(aid, stashKey) || await arcodJobStream(aid, track.title, track.artist, userToken, deadline);
                    if (u) return Response.json({ url: proxied(u), source: 'arcod', quality: track.quality || '24-Bit FLAC (Qobuz via ARCOD)' });
                }

                const cleanQuery = `${track.title || ''} ${track.artist || ''}`.replace(/\s+/g, ' ').trim();
                let results = await searchArcod(cleanQuery, userToken);
                if (!results.length) {
                    const simpleQuery = `${(track.title || '').split('(')[0].trim()} ${(track.artist || '').split(',')[0].trim()}`.trim();
                    if (simpleQuery !== cleanQuery) results = await searchArcod(simpleQuery, userToken);
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
                        const u = await arcodFastStream(mid, stashKey) || await arcodJobStream(mid, best.title || track.title, best.performer?.name || track.artist, userToken, deadline);
                        if (u) return Response.json({ url: proxied(u), source: 'arcod', quality: '24-Bit FLAC (Qobuz via ARCOD)' });
                    }
                }
                arcodError = 'No lossless match found for this track';
            } catch (e: any) {
                arcodError = e.message || 'ARCOD error';
                console.warn('[Stream] ARCOD block threw:', arcodError);
            }
        }

        // ── Gated fallback: only when the user enabled it in settings ──
        if (allowFallback) {
            const yt = (await fetchSoundCloudStream(track)) || (await fetchOnlineYouTubeStream(track, deadline));
            if (yt) {
                const isSC = yt.includes('soundcloud.com') || yt.includes('sndcdn.com');
                return Response.json({
                    url: proxied(yt),
                    source: isSC ? 'soundcloud' : 'youtube',
                    quality: isSC ? 'AAC/MP3 (SoundCloud)' : 'AAC/Opus (YouTube Music)',
                    fallback: true,
                });
            }
        }

        // Nothing lossless, and either fallback was off or also failed. Tell the
        // client the reason so it can surface it and skip the track.
        return Response.json({
            error: 'lossless_only',
            reason: arcodError || (disableLossless ? 'Lossless disabled and no fallback' : 'No lossless source for this track'),
            fallbackAttempted: allowFallback,
        }, { status: 200 });
    } catch (e: any) {
        return Response.json({ error: 'Stream resolution failed: ' + (e.message || 'unknown') }, { status: 500 });
    }
}
