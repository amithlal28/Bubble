import { NextResponse } from 'next/server';

const SPOTDL_CLIENT_ID = '5f573c9620494bae87890c0f08a60293';
const SPOTDL_CLIENT_SECRET = '212476d9b0f3472eaa762d90b19b0ba8';

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

function getSpotifyCredentials(request: Request, body?: any) {
    const headerId = request.headers.get('x-spotify-client-id');
    const headerSecret = request.headers.get('x-spotify-client-secret');

    const clientId = headerId || body?.client_id || process.env.SPOTIFY_CLIENT_ID || process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || SPOTDL_CLIENT_ID;
    const clientSecret = headerSecret || body?.client_secret || process.env.SPOTIFY_CLIENT_SECRET || SPOTDL_CLIENT_SECRET;

    return { clientId, clientSecret };
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
    const { clientId } = getSpotifyCredentials(request);

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
        const { clientId, clientSecret } = getSpotifyCredentials(request, body);

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
