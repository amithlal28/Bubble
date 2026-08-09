import { NextResponse } from 'next/server';
import { spotifyGetPlaylists } from '@/lib/spotify';

export async function GET(request: Request) {
    const spToken = request.headers.get('x-spotify-token') || '';
    const spCookie = request.headers.get('x-spotify-cookie') || '';
    if (!spToken && !spCookie) {
        return NextResponse.json({ error: 'Spotify token or cookie required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    try {
        const playlists = await spotifyGetPlaylists({ token: spToken, spDc: spCookie }, limit, offset);
        return NextResponse.json(playlists);
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Failed to fetch playlists' }, { status: 500 });
    }
}
