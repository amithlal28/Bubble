import crypto from 'crypto';

/* ── Spotify Official Client Credentials Flow (Zero-Auth / Public Data) ──
   spotDL's public client credentials (published in the open-source spotDL
   project — not secret). Override via env for a dedicated app. */
const SPOTDL_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || '5f573c9620494bae87890c0f08a60293';
const SPOTDL_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '212476d9b0f3472eaa762d90b19b0ba8';
let cachedSpotifyPublicToken: string | null = null;
let cachedSpotifyPublicTokenExpiry = 0;

export async function getSpotifyPublicToken(): Promise<string | null> {
    if (cachedSpotifyPublicToken && Date.now() < cachedSpotifyPublicTokenExpiry) {
        return cachedSpotifyPublicToken;
    }
    try {
        const auth = Buffer.from(`${SPOTDL_CLIENT_ID}:${SPOTDL_CLIENT_SECRET}`).toString('base64');
        const res = await spotifyFetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });
        if (res?.data?.access_token) {
            cachedSpotifyPublicToken = res.data.access_token;
            cachedSpotifyPublicTokenExpiry = Date.now() + ((res.data.expires_in || 3600) - 120) * 1000;
            return cachedSpotifyPublicToken;
        }
        return null;
    } catch (err: any) {
        console.error('Failed to get Spotify public client credentials token:', err.message);
        return null;
    }
}

/* ═══════════════════════════════════════════════════════════════════
   Spotify sp_dc Web Token + GraphQL Partner API
   ═══════════════════════════════════════════════════════════════════ */
const SPOTIFY_CLIENT_VERSION_FALLBACK = '1.2.87.311.g2db0c2c4';
const SPOTIFY_WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

export const SPOTIFY_HASH_LIBRARY_V3 = '973e511ca44261fda7eebac8b653155e7caee3675abb4fb110cc1b8c78b091c3';
export const SPOTIFY_HASH_FETCH_PLAYLIST = '32b05e92e438438408674f95d0fdad8082865dc32acd55bd97f5113b8579092b';
export const SPOTIFY_HASH_FETCH_LIBRARY_TRACKS = '087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240';
export const SPOTIFY_HASH_LIBRARY_MUTATION = '1ad0d40b3c09660d818b9e770eb1e84745dfbe941df159a64f8772b6fa2bfc3a';
export const SPOTIFY_HASH_HOME = '23e37f2e58d82d567f27080101d36609009d8c3676457b1086cb0acc55b72a5d';

const SPOTIFY_TOTP_CIPHER = [
    44, 55, 47, 42, 70, 40, 34, 114, 76, 74,
    50, 111, 120, 97, 75, 76, 94, 102, 43, 69,
    49, 120, 118, 80, 64, 78
];

// Per-session / global caching map
interface TokenSession {
    webToken: string | null;
    webTokenExpiry: number;
    clientId: string | null;
    clientToken: string | null;
    deviceId: string | null;
}

const sessionCache = new Map<string, TokenSession>();
let cachedSpotifyClientVersion: string | null = null;

function getSession(spDc: string): TokenSession {
    const key = spDc.trim();
    let s = sessionCache.get(key);
    if (!s) {
        s = {
            webToken: null,
            webTokenExpiry: 0,
            clientId: null,
            clientToken: null,
            deviceId: null
        };
        sessionCache.set(key, s);
    }
    return s;
}

export async function spotifyFetch(url: string, options: any = {}) {
    const headers = { 'User-Agent': SPOTIFY_WEB_UA, ...(options.headers || {}) };
    const fetchOptions: any = {
        method: options.method || 'GET',
        headers,
        redirect: 'follow',
        cache: 'no-store'
    };
    if (options.body !== undefined) {
        fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }
    const res = await fetch(url, fetchOptions);
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = text; }
    const headersOut: Record<string, string> = {};
    if (res.headers && typeof (res.headers as any).forEach === 'function') {
        (res.headers as any).forEach((v: string, k: string) => { headersOut[k] = v; });
    }
    return { status: res.status, headers: headersOut, data, rawData: text };
}

export function spotifyTotp(serverTimeSeconds: number): string {
    const transformed = SPOTIFY_TOTP_CIPHER.map((b, i) => b ^ ((i % 33) + 9));
    const joined = transformed.join('');
    const hexStr = Buffer.from(joined, 'utf8').toString('hex');
    const secret = Buffer.from(hexStr, 'hex');
    const counter = Math.floor(serverTimeSeconds / 30);
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', secret).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);
    const otp = binary % Math.pow(10, 6);
    return otp.toString().padStart(6, '0');
}

export async function getSpotifyServerTime(): Promise<number> {
    try {
        const res = await spotifyFetch('https://open.spotify.com/', {
            method: 'HEAD',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const dateHeader = res.headers && (res.headers['date'] || res.headers['Date']);
        if (dateHeader) {
            const t = Date.parse(dateHeader);
            if (!isNaN(t)) return Math.floor(t / 1000);
        }
    } catch (e) { /* ignore */ }
    return Math.floor(Date.now() / 1000);
}

export function spotifyUsernameFromJwt(accessToken: string): string | null {
    try {
        const parts = String(accessToken).split('.');
        if (parts.length < 2) return null;
        // Try base64url (Node 15.7+), fall back to base64
        let payload: any;
        try {
            payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        } catch {
            // Fallback: replace URL-safe chars and use base64
            let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4) b64 += '=';
            payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
        }
        console.log('[Spotify Auth] JWT payload:', JSON.stringify(payload).substring(0, 200));
        return payload.sub || payload.username || payload.email || payload.name || null;
    } catch (e: any) {
        console.warn('[Spotify Auth] JWT decode error:', e.message);
        return null;
    }
}

export async function getSpotifyWebAccessToken(spDc: string, force = false): Promise<string | null> {
    const cleanCookie = cleanSpDc(spDc);
    if (!cleanCookie) return null;
    const session = getSession(cleanCookie);
    const now = Date.now();
    if (!force && session.webToken && now < session.webTokenExpiry - 60000) {
        return session.webToken;
    }
    try {
        const serverTime = await getSpotifyServerTime();
        const totp = spotifyTotp(serverTime);
        const url = 'https://open.spotify.com/api/token' +
            '?reason=transport' +
            '&productType=web-player' +
            `&totp=${totp}` +
            `&totpServer=${totp}` +
            '&totpVer=61';

        let res = await spotifyFetch(url, {
            headers: {
                'Cookie': `sp_dc=${cleanCookie}`,
                'User-Agent': SPOTIFY_WEB_UA,
                'Accept': 'application/json',
                'App-Platform': 'WebPlayer',
                'Referer': 'https://open.spotify.com/'
            }
        });

        if (res.status === 200 && res.data && res.data.accessToken && !res.data.isAnonymous) {
            const token = res.data.accessToken;
            session.webToken = token;
            session.webTokenExpiry = res.data.accessTokenExpirationTimestampMs || (now + 3600 * 1000);
            if (res.data.clientId) session.clientId = res.data.clientId;
            const setCookie = res.headers && (res.headers['set-cookie'] || '');
            const spT = String(setCookie).match(/(?:^|,)\s*sp_t=([^;]+)/);
            if (spT && spT[1]) session.deviceId = spT[1];
            console.log('[Spotify Auth] Got web token successfully');
            return token;
        }

        // Log the actual failure for debugging
        console.warn(`[Spotify Auth] Primary endpoint failed: status=${res.status}, isAnonymous=${res.data?.isAnonymous}, hasToken=${!!res.data?.accessToken}, body=${typeof res.rawData === 'string' ? res.rawData.substring(0, 200) : JSON.stringify(res.data).substring(0, 200)}`);

        // Endpoint Fallback: /get_access_token
        res = await spotifyFetch('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', {
            headers: {
                'Cookie': `sp_dc=${cleanCookie}`,
                'User-Agent': SPOTIFY_WEB_UA,
                'Accept': 'application/json',
                'Referer': 'https://open.spotify.com/'
            }
        });

        if (res.status === 200 && res.data && res.data.accessToken) {
            const token = res.data.accessToken;
            session.webToken = token;
            session.webTokenExpiry = res.data.accessTokenExpirationTimestampMs || (now + 3600 * 1000);
            if (res.data.clientId) session.clientId = res.data.clientId;
            console.log('[Spotify Auth] Got web token via fallback endpoint');
            return token;
        }

        console.warn(`[Spotify Auth] Fallback endpoint also failed: status=${res.status}, body=${typeof res.rawData === 'string' ? res.rawData.substring(0, 200) : JSON.stringify(res.data).substring(0, 200)}`);

        // Third fallback: try without TOTP (simple cookie auth)
        try {
            const simpleRes = await spotifyFetch('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', {
                headers: {
                    'Cookie': `sp_dc=${cleanCookie}`,
                    'User-Agent': SPOTIFY_WEB_UA,
                    'Accept': 'application/json',
                }
            });
            if (simpleRes.status === 200 && simpleRes.data?.accessToken) {
                const token = simpleRes.data.accessToken;
                session.webToken = token;
                session.webTokenExpiry = simpleRes.data.accessTokenExpirationTimestampMs || (now + 3600 * 1000);
                console.log('[Spotify Auth] Got web token via simple fallback');
                return token;
            }
            console.warn(`[Spotify Auth] Simple fallback failed: status=${simpleRes.status}`);
        } catch (e: any) {
            console.warn('[Spotify Auth] Simple fallback error:', e.message);
        }

        console.warn('[Spotify Auth] All token endpoints failed for sp_dc');
        return null;
    } catch (err: any) {
        console.error('Failed to get Spotify web access token:', err.message);
        return null;
    }
}

export async function getSpotifyClientVersion(): Promise<string> {
    if (cachedSpotifyClientVersion) return cachedSpotifyClientVersion;
    try {
        const res = await spotifyFetch('https://open.spotify.com/', {
            headers: { 'User-Agent': SPOTIFY_WEB_UA }
        });
        const body = typeof res.data === 'string' ? res.data : '';
        const match = body.match(/"clientVersion"\s*:\s*"([^"]+)"/);
        cachedSpotifyClientVersion = (match && match[1]) || SPOTIFY_CLIENT_VERSION_FALLBACK;
    } catch (e) {
        cachedSpotifyClientVersion = SPOTIFY_CLIENT_VERSION_FALLBACK;
    }
    return cachedSpotifyClientVersion;
}

export async function getSpotifyClientToken(spDc: string, clientId?: string | null): Promise<string | null> {
    const session = getSession(spDc);
    if (session.clientToken) return session.clientToken;
    let targetClientId = clientId || session.clientId;
    if (!targetClientId) {
        const token = await getSpotifyWebAccessToken(spDc);
        if (!token) return null;
        targetClientId = session.clientId;
    }
    if (!targetClientId) return null;

    try {
        const clientVersion = await getSpotifyClientVersion();
        const deviceId = session.deviceId || crypto.randomUUID();
        const body = {
            client_data: {
                client_version: clientVersion,
                client_id: targetClientId,
                js_sdk_data: {
                    device_brand: 'unknown',
                    device_model: 'unknown',
                    os: 'windows',
                    os_version: 'NT 10.0',
                    device_id: deviceId,
                    device_type: 'computer'
                }
            }
        };

        const res = await spotifyFetch('https://clienttoken.spotify.com/v1/clienttoken', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': SPOTIFY_WEB_UA
            },
            body: JSON.stringify(body)
        });

        if (res.status === 200 && res.data?.response_type === 'RESPONSE_GRANTED_TOKEN_RESPONSE' && res.data?.granted_token?.token) {
            session.clientToken = res.data.granted_token.token;
            return session.clientToken;
        }
        console.warn('Spotify client token request failed HTTP', res.status);
        return null;
    } catch (err: any) {
        console.error('Failed to get Spotify client token:', err.message);
        return null;
    }
}

export async function spotifyGraphQL(operationName: string, variables: any, hash: string, spDc: string): Promise<any> {
    if (!spDc) return null;
    const session = getSession(spDc);

    let accessToken = await getSpotifyWebAccessToken(spDc);
    if (!accessToken) return null;

    let clientToken = await getSpotifyClientToken(spDc, session.clientId);
    if (!clientToken) return null;

    const encodedVariables = encodeURIComponent(JSON.stringify(variables));
    const extensions = encodeURIComponent(JSON.stringify({
        persistedQuery: { version: 1, sha256Hash: hash }
    }));
    const url = 'https://api-partner.spotify.com/pathfinder/v1/query' +
        `?operationName=${operationName}` +
        `&variables=${encodedVariables}` +
        `&extensions=${extensions}`;

    const buildHeaders = (tok: string, ctok: string) => ({
        'Authorization': `Bearer ${tok}`,
        'Client-Token': ctok,
        'Accept': 'application/json',
        'App-Platform': 'WebPlayer',
        'Spotify-App-Version': cachedSpotifyClientVersion || SPOTIFY_CLIENT_VERSION_FALLBACK,
        'Origin': 'https://open.spotify.com',
        'Referer': 'https://open.spotify.com/',
        'User-Agent': SPOTIFY_WEB_UA
    });

    try {
        let res = await spotifyFetch(url, { headers: buildHeaders(accessToken, clientToken) });

        if (res.status === 401) {
            session.clientToken = null;
            session.clientId = null;
            accessToken = await getSpotifyWebAccessToken(spDc, true);
            clientToken = await getSpotifyClientToken(spDc, session.clientId);
            if (accessToken && clientToken) {
                res = await spotifyFetch(url, { headers: buildHeaders(accessToken, clientToken) });
            }
        }
        if (res.status === 400) {
            session.clientToken = null;
            clientToken = await getSpotifyClientToken(spDc, session.clientId);
            if (accessToken && clientToken) {
                res = await spotifyFetch(url, { headers: buildHeaders(accessToken, clientToken) });
            }
        }

        if (res.status === 200 && res.data) return res.data;
        console.warn(`Spotify GraphQL ${operationName} HTTP`, res.status);
        return null;
    } catch (err: any) {
        console.error(`Spotify GraphQL ${operationName} error:`, err.message);
        return null;
    }
}

export function mapSpotifyTrack(t: any) {
    if (!t) return null;
    return {
        id: `sp_${t.id}`,
        title: t.name || 'Unknown',
        artist: (t.artists || []).map((a: any) => a.name).filter(Boolean).join(', ') || 'Unknown Artist',
        album: (t.album && t.album.name) || '',
        duration: Math.round((t.duration_ms || 0) / 1000),
        artwork_url: (t.album && t.album.images && t.album.images[0] && t.album.images[0].url) || '',
        source: 'spotify',
        source_id: t.id,
        is_downloaded: 0
    };
}

export function mapSpotifyGraphQLTrack(data: any, wrapper: any = null) {
    if (!data && !wrapper) return null;

    let uri = (data && data.uri) ||
        (wrapper && wrapper._uri) ||
        (wrapper && wrapper.track && (wrapper.track._uri || wrapper.track.uri)) ||
        (wrapper && wrapper.item && (wrapper.item._uri || wrapper.item.uri)) ||
        (wrapper && wrapper.itemV2 && (wrapper.itemV2._uri || wrapper.itemV2.uri)) ||
        (wrapper && wrapper.uri) || '';

    if (!uri && data && data.id) uri = `spotify:track:${data.id}`;
    if (!uri && wrapper && wrapper.id) uri = `spotify:track:${wrapper.id}`;

    if (!uri || !uri.startsWith('spotify:track:')) {
        if (typeof uri === 'string' && /^[a-zA-Z0-9]{22}$/.test(uri)) {
            uri = `spotify:track:${uri}`;
        } else {
            return null;
        }
    }

    const trackId = uri.replace('spotify:track:', '');

    let artistsList: string[] = [];
    if (data && Array.isArray(data.artists)) {
        artistsList = data.artists.map((a: any) => a?.profile?.name || a?.name || (typeof a === 'string' ? a : '')).filter(Boolean);
    } else if (data && data.artists && Array.isArray(data.artists.items)) {
        artistsList = data.artists.items.map((a: any) => a?.profile?.name || a?.name).filter(Boolean);
    } else if (wrapper && Array.isArray(wrapper.artists)) {
        artistsList = wrapper.artists.map((a: any) => a?.profile?.name || a?.name || (typeof a === 'string' ? a : '')).filter(Boolean);
    }

    const title = (data && (data.name || data.title)) ||
        (wrapper && (wrapper.name || wrapper.title)) ||
        (wrapper && wrapper.track && (wrapper.track.name || wrapper.track.title)) || 'Unknown';

    const durationMs = (data && data.trackDuration && data.trackDuration.totalMilliseconds) ||
        (data && data.duration && data.duration.totalMilliseconds) ||
        (data && (data.durationMs || data.duration_ms)) ||
        (wrapper && (wrapper.durationMs || wrapper.duration_ms)) ||
        (wrapper && wrapper.track && (wrapper.track.durationMs || wrapper.track.duration_ms)) || 0;

    const albumData = (data && (data.albumOfTrack || data.album)) ||
        (wrapper && (wrapper.albumOfTrack || wrapper.album)) ||
        (wrapper && wrapper.track && (wrapper.track.albumOfTrack || wrapper.track.album));
    const albumName = (albumData && albumData.name) || '';
    let artwork = '';
    if (albumData) {
        if (albumData.coverArt && Array.isArray(albumData.coverArt.sources) && albumData.coverArt.sources.length > 0) {
            artwork = albumData.coverArt.sources[0].url;
        } else if (Array.isArray(albumData.images) && albumData.images.length > 0) {
            artwork = albumData.images[0].url;
        }
    }

    return {
        id: `sp_${trackId}`,
        title,
        artist: artistsList.join(', ') || 'Unknown Artist',
        album: albumName,
        duration: Math.round(durationMs / 1000),
        artwork_url: artwork,
        source: 'spotify',
        source_id: trackId,
        is_downloaded: 0,
        is_liked: 1
    };
}

export function extractTracksFromGraphQLResponse(response: any) {
    if (!response || !response.data) return [];
    const tracks: any[] = [];
    const seen = new Set();

    function scan(items: any) {
        if (!Array.isArray(items)) return;
        for (const el of items) {
            if (!el || typeof el !== 'object') continue;
            const data = (el.itemV2 && el.itemV2.data) ||
                (el.track && el.track.data) ||
                (el.item && el.item.data) ||
                el.data ||
                (el.track && typeof el.track === 'object' ? el.track : null) ||
                el;
            const mapped = mapSpotifyGraphQLTrack(data, el);
            if (mapped && !seen.has(mapped.id)) {
                seen.add(mapped.id);
                mapped.is_liked = 1;
                tracks.push(mapped);
            }
        }
    }

    const d = response.data;
    if (d.playlistV2?.content?.items) scan(d.playlistV2.content.items);
    if (d.playlist?.content?.items) scan(d.playlist.content.items);
    if (d.me?.library?.tracks?.items) scan(d.me.library.tracks.items);
    if (d.me?.libraryTracks?.items) scan(d.me.libraryTracks.items);
    if (d.me?.libraryV3?.items) scan(d.me.libraryV3.items);
    if (d.library?.tracks?.items) scan(d.library.tracks.items);

    if (tracks.length === 0) {
        for (const k of Object.keys(d)) {
            if (Array.isArray(d[k]?.items)) scan(d[k].items);
            if (Array.isArray(d[k]?.content?.items)) scan(d[k].content.items);
            if (d[k] && typeof d[k] === 'object') {
                for (const sub of Object.keys(d[k])) {
                    if (Array.isArray(d[k][sub]?.items)) scan(d[k][sub].items);
                    if (Array.isArray(d[k][sub]?.tracks?.items)) scan(d[k][sub].tracks.items);
                }
            }
        }
    }
    return tracks;
}

export interface SpotifyAuthContext {
    token?: string;
    spDc?: string;
}

export function cleanSpDc(cookie: string): string {
    let str = String(cookie || '').trim();
    if (str.startsWith('sp_dc=')) str = str.substring(6).trim();
    if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
        str = str.slice(1, -1).trim();
    }
    if (str.includes(';')) str = str.split(';')[0].trim();
    return str;
}

export function parseAuthContext(input: any): SpotifyAuthContext {
    if (!input) return {};
    if (typeof input === 'object') {
        const tok = input.token || input.access_token;
        const rawCookie = input.spDc || input.cookie;
        return { token: tok, spDc: rawCookie ? cleanSpDc(rawCookie) : undefined };
    }
    const str = String(input).trim();
    if (str.startsWith('BQ') || str.length > 180) {
        return { token: str };
    }
    return { spDc: cleanSpDc(str) };
}

export async function spotifyGetProfile(authInput: any) {
    const { token: userToken, spDc } = parseAuthContext(authInput);

    // 1. If OAuth user token is provided:
    if (userToken) {
        try {
            const res = await spotifyFetch('https://api.spotify.com/v1/me', {
                headers: { 'Authorization': `Bearer ${userToken}`, 'Accept': 'application/json' }
            });
            if (res.status === 200 && res.data) {
                return {
                    id: res.data.id,
                    display_name: res.data.display_name || res.data.id,
                    email: res.data.email || '',
                    avatar_url: res.data.images?.[0]?.url || '',
                    uri: res.data.uri || `spotify:user:${res.data.id}`
                };
            }
        } catch (e: any) {
            console.warn('[Spotify Profile] OAuth fetch error:', e.message);
        }
    }

    // 2. If spDc cookie is provided:
    if (spDc) {
        const webToken = await getSpotifyWebAccessToken(spDc);
        if (!webToken) return null;

        // Web token obtained successfully — cookie is valid
        // Try JWT decode for username (web tokens may not be JWTs)
        const username = spotifyUsernameFromJwt(webToken);
        if (username) {
            return { id: username, display_name: username };
        }

        // Try Spotify API for profile (may be rate limited)
        try {
            const apiRes = await spotifyFetch('https://api.spotify.com/v1/me', {
                headers: { 'Authorization': `Bearer ${webToken}`, 'Accept': 'application/json' }
            });
            if (apiRes.status === 200 && apiRes.data?.id) {
                return {
                    id: apiRes.data.id,
                    display_name: apiRes.data.display_name || apiRes.data.id,
                    email: apiRes.data.email || '',
                    avatar_url: apiRes.data.images?.[0]?.url || '',
                    uri: apiRes.data.uri || `spotify:user:${apiRes.data.id}`
                };
            }
        } catch (e: any) { /* ignore */ }

        // Cookie is valid even if we couldn't get profile details yet
        return { id: 'spotify_user', display_name: 'Spotify User' };
    }

    return null;
}

export async function spotifyGetPlaylists(authInput: any, limit = 50, offset = 0) {
    const { token: userToken, spDc } = parseAuthContext(authInput);

    // 1. If OAuth user token:
    if (userToken) {
        try {
            const res = await spotifyFetch(`https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`, {
                headers: { 'Authorization': `Bearer ${userToken}`, 'Accept': 'application/json' }
            });

            if (res.status === 200 && res.data && Array.isArray(res.data.items)) {
                if (res.data.items.length === 0 && offset === 0) {
                    throw new Error(`DEBUG 0 PLAYLISTS: ${JSON.stringify({
                        total: res.data.total,
                        scopes: res.headers['x-oauth-scopes'] || res.headers['X-OAuth-Scopes']
                    })}`);
                }
                return res.data.items.filter(Boolean).map((p: any) => ({
                    id: `sp_${p.id}`,
                    name: p.name || 'Untitled Playlist',
                    description: p.description || '',
                    artwork_url: (p.images || [])[0]?.url || '',
                    source: 'spotify',
                    source_id: p.id,
                    owner: p.owner?.display_name || p.owner?.id || '',
                    track_count: p.tracks?.total || 0,
                    is_synced: 1,
                    sync_mode: 'refresh'
                }));
            } else {
                console.warn('[Spotify Playlists] Failed to fetch:', res.status, res.data);
                throw new Error(`Spotify API returned HTTP ${res.status}: ${JSON.stringify(res.data)}`);
            }
        } catch (e: any) {
            console.warn('[Spotify Playlists] OAuth error:', e.message);
            throw e;
        }
    }

    // 2. If spDc cookie (GraphQL):
    if (spDc) {
        try {
            const variables = {
                filters: ['Playlists'],
                order: null,
                textFilter: '',
                features: ['LIKED_SONGS', 'YOUR_EPISODES'],
                limit,
                offset
            };
            const response = await spotifyGraphQL('libraryV3', variables, SPOTIFY_HASH_LIBRARY_V3, spDc);
            if (response) {
                const items = response.data?.me?.libraryV3?.items;
                if (Array.isArray(items)) {
                    const playlists = [];
                    for (const el of items) {
                        const item = el && el.item;
                        const data = item && item.data;
                        if (!data) continue;
                        const uri = data.uri || '';
                        if (!uri.startsWith('spotify:playlist:')) continue;
                        const id = uri.replace('spotify:playlist:', '');
                        const name = data.name || 'Untitled';
                        const owner = (data.ownerV2 && data.ownerV2.data && data.ownerV2.data.username) || '';
                        const imageUrl = (data.images && data.images.items && data.images.items[0] &&
                            data.images.items[0].sources && data.images.items[0].sources[0] &&
                            data.images.items[0].sources[0].url) || '';
                        const trackCount = (data.content && data.content.totalCount) || 0;
                        playlists.push({
                            id: `sp_${id}`,
                            name,
                            description: '',
                            artwork_url: imageUrl,
                            source: 'spotify',
                            source_id: id,
                            owner,
                            track_count: trackCount,
                            is_synced: 1,
                            sync_mode: 'refresh'
                        });
                    }
                    return playlists;
                }
            }
        } catch (err: any) {
            console.error('spotifyGetPlaylists error:', err.message);
        }
    }

    return [];
}

export async function spotifyGetPlaylistTracks(playlistId: string, authInput?: any) {
    const cleanId = String(playlistId).replace(/^sp_playlist_/, '').replace(/^sp_/, '');
    const { token: userToken, spDc } = parseAuthContext(authInput);
    const tracks: any[] = [];
    const seen = new Set();

    // 1. If user OAuth token:
    if (userToken) {
        try {
            let url: string | null = `https://api.spotify.com/v1/playlists/${cleanId}/tracks?limit=100`;
            while (url) {
                const res = await spotifyFetch(url, {
                    headers: { 'Authorization': `Bearer ${userToken}`, 'Accept': 'application/json' }
                });
                if (res.status !== 200 || !res.data || !Array.isArray(res.data.items)) break;
                for (const item of res.data.items) {
                    if (!item || !item.track || item.track.is_local) continue;
                    const mapped = mapSpotifyTrack(item.track);
                    if (mapped && !seen.has(mapped.id)) {
                        seen.add(mapped.id);
                        tracks.push(mapped);
                    }
                }
                url = res.data.next || null;
            }
            if (tracks.length > 0) return tracks;
        } catch (e: any) {
            console.warn('[Spotify Playlist Tracks] OAuth error:', e.message);
        }
    }

    // 2. Public Web API with client_credentials token
    try {
        const ccToken = await getSpotifyPublicToken();
        if (ccToken) {
            let url: string | null = `https://api.spotify.com/v1/playlists/${cleanId}/tracks?limit=50&offset=0` +
                '&fields=items(track(id,name,uri,duration_ms,artists(id,name),album(id,name,images))),next';
            while (url) {
                const res = await spotifyFetch(url, {
                    headers: { 'Authorization': `Bearer ${ccToken}`, 'Accept': 'application/json' }
                });
                if (res.status !== 200 || !res.data || !Array.isArray(res.data.items)) break;
                for (const item of res.data.items) {
                    if (!item || !item.track || item.track.is_local) continue;
                    const mapped = mapSpotifyTrack(item.track);
                    if (mapped && !seen.has(mapped.id)) {
                        seen.add(mapped.id);
                        tracks.push(mapped);
                    }
                }
                url = res.data.next || null;
            }
        }
    } catch (e: any) {
        console.warn('Spotify Web API playlist tracks error:', e.message);
    }

    // 3. GraphQL fetchPlaylist fallback with spDc
    if (tracks.length === 0 && spDc) {
        let offset = 0;
        const pageSize = 100;
        while (true) {
            const variables = {
                uri: `spotify:playlist:${cleanId}`,
                offset,
                limit: pageSize,
                enableWatchFeedEntrypoint: false
            };
            const response = await spotifyGraphQL('fetchPlaylist', variables, SPOTIFY_HASH_FETCH_PLAYLIST, spDc);
            if (!response) break;
            const pageTracks = extractTracksFromGraphQLResponse(response);
            for (const t of pageTracks) {
                if (!seen.has(t.id)) {
                    seen.add(t.id);
                    tracks.push(t);
                }
            }
            const rawCount = response.data?.playlistV2?.content?.items?.length ||
                response.data?.playlist?.content?.items?.length || pageTracks.length;
            if (rawCount < pageSize) break;
            offset += pageSize;
        }
    }

    return tracks;
}

export async function spotifyGetLikedSongs(authInput: any, limit = 50, offset = 0) {
    const { token: userToken, spDc } = parseAuthContext(authInput);

    // 1. User OAuth token
    if (userToken) {
        try {
            const res = await spotifyFetch(
                `https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`,
                { headers: { 'Authorization': `Bearer ${userToken}`, 'Accept': 'application/json' } }
            );
            if (res.status === 200 && res.data && Array.isArray(res.data.items)) {
                if (res.data.items.length === 0 && offset === 0) {
                    throw new Error(`DEBUG 0 TRACKS: ${JSON.stringify({
                        total: res.data.total,
                        next: res.data.next,
                        scopes: res.headers['x-oauth-scopes'] || res.headers['X-OAuth-Scopes'],
                        body: res.data
                    })}`);
                }
                return res.data.items
                    .filter((item: any) => item && item.track)
                    .map((item: any) => {
                        const t = item.track;
                        return {
                            id: `sp_${t.id}`,
                            title: t.name || 'Unknown',
                            artist: (t.artists || []).map((a: any) => a.name).join(', ') || 'Unknown Artist',
                            album: (t.album && t.album.name) || '',
                            duration: Math.round((t.duration_ms || 0) / 1000),
                            artwork_url: (t.album && t.album.images && t.album.images[0] && t.album.images[0].url) || '',
                            source: 'spotify',
                            source_id: t.id,
                            is_downloaded: 0,
                            is_liked: 1
                        };
                    });
            } else {
                console.warn('[Spotify Liked Songs] Failed to fetch:', res.status, res.data);
                throw new Error(`Spotify API returned HTTP ${res.status}: ${JSON.stringify(res.data)}`);
            }
        } catch (e: any) {
            console.warn('[Spotify Liked Songs] OAuth error:', e.message);
            throw e;
        }
    }

    // 2. spDc GraphQL query
    if (spDc) {
        try {
            const variables = { offset, limit };
            const response = await spotifyGraphQL('fetchLibraryTracks', variables, SPOTIFY_HASH_FETCH_LIBRARY_TRACKS, spDc);
            if (response) {
                const tracks = extractTracksFromGraphQLResponse(response);
                if (tracks.length > 0) return tracks;
            }
        } catch (err: any) {
            console.warn('[Spotify Liked Songs] fetchLibraryTracks error:', err.message);
        }

        try {
            const variables = {
                uri: 'spotify:collection:tracks',
                offset,
                limit,
                enableWatchFeedEntrypoint: false
            };
            const response = await spotifyGraphQL('fetchPlaylist', variables, SPOTIFY_HASH_FETCH_PLAYLIST, spDc);
            if (response) {
                const tracks = extractTracksFromGraphQLResponse(response);
                if (tracks.length > 0) return tracks;
            }
        } catch (err: any) {
            console.warn('[Spotify Liked Songs] fetchPlaylist failed:', err.message);
        }
    }

    return [];
}

export async function spotifyGetMixes(authInput: any) {
    const { token: userToken, spDc } = parseAuthContext(authInput);

    // 1. User OAuth token (Top tracks & recommendations)
    if (userToken) {
        try {
            const res = await spotifyFetch('https://api.spotify.com/v1/me/top/tracks?limit=20', {
                headers: { 'Authorization': `Bearer ${userToken}`, 'Accept': 'application/json' }
            });
            if (res.status === 200 && res.data && Array.isArray(res.data.items)) {
                return [{
                    id: 'sp_mix_top',
                    name: 'Your Top Mix',
                    description: 'Your most played Spotify tracks',
                    artwork_url: res.data.items[0]?.album?.images?.[0]?.url || '',
                    source: 'spotify',
                    source_id: 'top',
                    owner: 'spotify',
                    track_count: res.data.items.length,
                    is_synced: 1,
                    sync_mode: 'refresh',
                    is_mix: true
                }];
            }
        } catch (e: any) {
            console.warn('[Spotify Mixes] OAuth error:', e.message);
        }
    }

    // 2. spDc GraphQL home sections
    if (spDc) {
        try {
            const session = getSession(spDc);
            const variables = {
                homeEndUserIntegration: 'INTEGRATION_WEB_PLAYER',
                timeZone: 'UTC',
                sp_t: session.deviceId || '',
                facet: null,
                sectionItemsLimit: 40
            };
            const response = await spotifyGraphQL('home', variables, SPOTIFY_HASH_HOME, spDc);
            if (response) {
                const sections = response.data?.home?.sectionContainer?.sections?.items;
                if (Array.isArray(sections)) {
                    const DAILY_MIX_REGEX = /^Daily Mix \d+$/;
                    const MIX_NAMES = new Set(['discover weekly', 'release radar', 'on repeat', 'repeat rewind', 'time capsule', 'daylist']);
                    const mixes: any[] = [];
                    const seen = new Set();
                    for (const section of sections) {
                        const items = section?.sectionItems?.items;
                        if (!Array.isArray(items)) continue;
                        for (const item of items) {
                            const data = item?.content?.data;
                            if (!data || data.__typename !== 'Playlist') continue;
                            const name = data.name || '';
                            const uri = data.uri || '';
                            if (!uri.startsWith('spotify:playlist:')) continue;
                            const playlistId = uri.replace('spotify:playlist:', '');
                            if (seen.has(playlistId)) continue;
                            const ownerId = (data.ownerV2?.data?.username || data.ownerV2?.data?.id) || 'spotify';
                            let isMix = DAILY_MIX_REGEX.test(name) || MIX_NAMES.has(name.toLowerCase()) || ownerId === 'spotify';
                            if (!isMix) continue;
                            seen.add(playlistId);
                            mixes.push({
                                id: `sp_${playlistId}`,
                                name,
                                description: '',
                                artwork_url: data.images?.items?.[0]?.sources?.[0]?.url || '',
                                source: 'spotify',
                                source_id: playlistId,
                                owner: ownerId,
                                track_count: data.content?.totalCount || 0,
                                is_synced: 1,
                                sync_mode: 'refresh',
                                is_mix: true
                            });
                        }
                    }
                    return mixes;
                }
            }
        } catch (err: any) {
            console.error('spotifyGetMixes error:', err.message);
        }
    }

    return [];
}

export async function spotifySetLibrary(authInput: any, uris: string[], add: boolean) {
    const { token: userToken, spDc } = parseAuthContext(authInput);
    if (!uris || uris.length === 0) return true;

    if (userToken) {
        try {
            const ids = uris.map(u => u.replace(/^spotify:track:/, '').replace(/^sp_/, '')).join(',');
            const res = await spotifyFetch(`https://api.spotify.com/v1/me/tracks?ids=${ids}`, {
                method: add ? 'PUT' : 'DELETE',
                headers: { 'Authorization': `Bearer ${userToken}`, 'Content-Type': 'application/json' }
            });
            return res.status === 200 || res.status === 201;
        } catch (e: any) {
            console.warn('[Spotify Set Library] OAuth error:', e.message);
        }
    }

    if (spDc) {
        try {
            const op = add ? 'addToLibrary' : 'removeFromLibrary';
            const variables = { libraryItemUris: uris.map(u => u.startsWith('spotify:') ? u : `spotify:track:${u}`) };
            const response = await spotifyGraphQL(op, variables, SPOTIFY_HASH_LIBRARY_MUTATION, spDc);
            return !!response;
        } catch (err: any) {
            console.error('spotifySetLibrary error:', err.message);
        }
    }

    return false;
}

export async function spotifySearchCatalog(query: string, types = ['album', 'artist', 'playlist', 'track'], limit = 20, authInput?: any) {
    try {
        const { token: userToken, spDc } = parseAuthContext(authInput);
        let token: string | null = userToken || null;
        if (!token && spDc) {
            token = await getSpotifyWebAccessToken(spDc);
        }
        if (!token) {
            token = await getSpotifyPublicToken();
        }
        if (!token) return { error: 'auth_failed' };

        const typeStr = types.join(',');
        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${typeStr}&limit=${limit}`;
        const res = await spotifyFetch(url, {
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
        });

        if (res.status !== 200 || !res.data) return { error: 'search_failed', status: res.status };

        const result: any = { albums: [], artists: [], playlists: [], tracks: [] };

        if (res.data.albums?.items) {
            result.albums = res.data.albums.items.map((a: any) => ({
                id: `sp_album_${a.id}`,
                source_id: a.id,
                name: a.name,
                artist: (a.artists || []).map((ar: any) => ar.name).join(', '),
                artwork_url: (a.images || [])[0]?.url || '',
                type: 'album',
                source: 'spotify',
                uri: a.uri,
                total_tracks: a.total_tracks || 0
            }));
        }

        if (res.data.artists?.items) {
            result.artists = res.data.artists.items.map((a: any) => ({
                id: `sp_artist_${a.id}`,
                source_id: a.id,
                name: a.name,
                artwork_url: (a.images || [])[0]?.url || '',
                type: 'artist',
                source: 'spotify',
                uri: a.uri,
                followers: a.followers?.total || 0,
                genres: a.genres || []
            }));
        }

        if (res.data.playlists?.items) {
            result.playlists = res.data.playlists.items.map((p: any) => ({
                id: `sp_playlist_${p.id}`,
                source_id: p.id,
                name: p.name,
                description: p.description || '',
                owner: p.owner?.display_name || '',
                artwork_url: (p.images || [])[0]?.url || '',
                type: 'playlist',
                source: 'spotify',
                uri: p.uri,
                total_tracks: p.tracks?.total || 0
            }));
        }

        if (res.data.tracks?.items) {
            result.tracks = res.data.tracks.items.map((t: any) => ({
                id: `sp_${t.id}`,
                source_id: t.id,
                title: t.name,
                artist: (t.artists || []).map((a: any) => a.name).join(', '),
                album: t.album?.name || '',
                duration: Math.round((t.duration_ms || 0) / 1000),
                artwork_url: t.album?.images?.[0]?.url || '',
                type: 'track',
                source: 'spotify',
                uri: t.uri,
                popularity: t.popularity || 0
            }));
        }

        return result;
    } catch (err: any) {
        console.error('spotifySearchCatalog error:', err.message);
        return { error: err.message };
    }
}

export async function spotifySaveAlbum(authInput: any, albumId: string) {
    try {
        const { token: userToken, spDc } = parseAuthContext(authInput);
        let token: string | null = userToken || null;
        if (!token && spDc) token = await getSpotifyWebAccessToken(spDc);
        if (!token) return { error: 'auth_failed' };
        const cleanId = String(albumId).replace(/^sp_album_/, '');
        const res = await spotifyFetch(`https://api.spotify.com/v1/me/albums?ids=${cleanId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        return { success: res.status === 200 || res.status === 201 };
    } catch (err: any) {
        return { error: err.message };
    }
}

export async function spotifyFollowPlaylist(authInput: any, playlistId: string) {
    try {
        const { token: userToken, spDc } = parseAuthContext(authInput);
        let token: string | null = userToken || null;
        if (!token && spDc) token = await getSpotifyWebAccessToken(spDc);
        if (!token) return { error: 'auth_failed' };
        const cleanId = String(playlistId).replace(/^sp_playlist_/, '').replace(/^sp_/, '');
        const res = await spotifyFetch(`https://api.spotify.com/v1/playlists/${cleanId}/followers`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        return { success: res.status === 200 || res.status === 201 };
    } catch (err: any) {
        return { error: err.message };
    }
}

export async function spotifyGetAlbumTracks(albumId: string, authInput?: any) {
    const cleanId = String(albumId).replace(/^sp_album_/, '');
    try {
        const { token: userToken, spDc } = parseAuthContext(authInput);
        let token = userToken || null;
        if (!token && spDc) token = await getSpotifyWebAccessToken(spDc);
        if (!token) token = await getSpotifyPublicToken();
        if (!token) return [];
        const res = await spotifyFetch(`https://api.spotify.com/v1/albums/${cleanId}/tracks?limit=50`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
        });
        if (res.status === 200 && res.data?.items) {
            return res.data.items.map((t: any) => mapSpotifyTrack(t)).filter(Boolean);
        }
    } catch (e: any) {
        console.error('spotifyGetAlbumTracks error:', e.message);
    }
    return [];
}

