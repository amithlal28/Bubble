/**
 * /api/spotify/proxy — Proxies Spotify Web API calls
 * Uses a Spotify cookie stored client-side (sent via header or cookie).
 * 
 * GET/POST /api/spotify/proxy?path=/v1/me/playlists
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const spotifyPath = searchParams.get('path') || '/v1/me';
    const spCookie = request.headers.get('x-spotify-cookie') || '';

    if (!spCookie) {
        return Response.json({ error: 'Spotify cookie required' }, { status: 401 });
    }

    try {
        const res = await fetch(`https://api.spotify.com${spotifyPath}`, {
            headers: {
                'Cookie': `sp_dc=${spCookie}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(15000),
        });

        if (res.status === 401) {
            return Response.json({ error: 'Invalid or expired Spotify cookie' }, { status: 401 });
        }

        const data = await res.json();
        return Response.json(data);
    } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const { searchParams } = new URL(request.url);
    const spotifyPath = searchParams.get('path') || '/v1/me';
    const spCookie = request.headers.get('x-spotify-cookie') || '';
    const body = await request.json().catch(() => ({}));

    if (!spCookie) {
        return Response.json({ error: 'Spotify cookie required' }, { status: 401 });
    }

    try {
        const res = await fetch(`https://api.spotify.com${spotifyPath}`, {
            method: 'POST',
            headers: {
                'Cookie': `sp_dc=${spCookie}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
        });

        const data = await res.json();
        return Response.json(data);
    } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}
