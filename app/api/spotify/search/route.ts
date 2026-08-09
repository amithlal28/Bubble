import { NextResponse } from 'next/server';
import { spotifySearchCatalog } from '@/lib/spotify';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const types = (searchParams.get('types') || 'album,artist,playlist,track').split(',');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const spToken = request.headers.get('x-spotify-token') || '';
    const spCookie = request.headers.get('x-spotify-cookie') || '';

    if (!query) {
        return NextResponse.json({ albums: [], artists: [], playlists: [], tracks: [] });
    }

    try {
        const results = await spotifySearchCatalog(query, types, limit, { token: spToken, spDc: spCookie });
        return NextResponse.json(results);
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Search failed' }, { status: 500 });
    }
}
