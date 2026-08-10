import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

// spotDL's public client credentials (published in the open-source spotDL
// project — not secret). Used only as the zero-config default; a signed-in
// user's own Spotify app creds (stored server-side in user_integrations) win.
const DEFAULT_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || '5f573c9620494bae87890c0f08a60293';
const DEFAULT_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '212476d9b0f3472eaa762d90b19b0ba8';

const SCOPES = [
    'user-read-private',
    'user-read-email',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-library-read',
    'user-library-modify',
    'playlist-modify-public',
    'playlist-modify-private',
    'user-top-read'
].join(' ');

// Resolve the Spotify app credentials for this request. Precedence:
//   1. The signed-in user's own app creds from user_integrations (server-side —
//      the client SECRET never travels through the browser).
//   2. A client-supplied client_id (header/body) — the id only, never a secret.
//   3. Env / public default (id + secret as a matched pair).
async function getSpotifyCredentials(request: Request, body?: any) {
    let dbId: string | null = null;
    let dbSecret: string | null = null;
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase
                .from('user_integrations')
                .select('spotify_client_id, spotify_client_secret')
                .eq('user_id', user.id)
                .maybeSingle();
            if (data) {
                dbId = data.spotify_client_id || null;
                dbSecret = data.spotify_client_secret || null;
            }
        }
    } catch { /* not signed in / no row — fall through to defaults */ }

    // A custom app's id+secret must come as a matched pair from the DB. We never
    // trust a client-supplied secret (that was the leak). If the user has no own
    // app, use their supplied client_id (id is not secret) with the default secret.
    if (dbId && dbSecret) {
        return { clientId: dbId, clientSecret: dbSecret };
    }
    const clientId = request.headers.get('x-spotify-client-id') || body?.client_id || DEFAULT_CLIENT_ID;
    return { clientId, clientSecret: DEFAULT_CLIENT_SECRET };
}

function getDefaultOrigin(request: Request) {
    if (process.env.NEXT_PUBLIC_APP_URL) {
        // Strip trailing slash if present
        return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
    }
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http://' : 'https://';
    return `${protocol}${host}`;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'url';
    const defaultOrigin = getDefaultOrigin(request);
    const redirectUri = searchParams.get('redirect_uri') || `${defaultOrigin}/auth/spotify/callback`;
    const { clientId } = await getSpotifyCredentials(request);

    if (action === 'url') {
        const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(SCOPES)}&show_dialog=true`;
        return NextResponse.json({ url: authUrl, client_id: clientId });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action = 'exchange', code, redirect_uri, refresh_token } = body;
        const { clientId, clientSecret } = await getSpotifyCredentials(request, body);

        const authHeader = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        if (action === 'exchange') {
            if (!code) {
                return NextResponse.json({ error: 'Authorization code required' }, { status: 400 });
            }

            const params = new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirect_uri || `${getDefaultOrigin(request)}/auth/spotify/callback`
            });

            const res = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params.toString()
            });

            const data = await res.json();
            if (!res.ok || data.error) {
                return NextResponse.json({ error: data.error_description || data.error || 'Failed to exchange code' }, { status: res.status });
            }

            return NextResponse.json({
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_in: data.expires_in,
                token_type: data.token_type
            });
        }

        if (action === 'refresh') {
            if (!refresh_token) {
                return NextResponse.json({ error: 'Refresh token required' }, { status: 400 });
            }

            const params = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refresh_token
            });

            const res = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params.toString()
            });

            const data = await res.json();
            if (!res.ok || data.error) {
                return NextResponse.json({ error: data.error_description || data.error || 'Failed to refresh token' }, { status: res.status });
            }

            return NextResponse.json({
                access_token: data.access_token,
                refresh_token: data.refresh_token || refresh_token,
                expires_in: data.expires_in
            });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Auth exchange failed' }, { status: 500 });
    }
}
