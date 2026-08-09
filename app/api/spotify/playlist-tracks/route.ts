import { NextResponse } from 'next/server';
import { spotifyGetPlaylistTracks } from '@/lib/spotify';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const playlistId = searchParams.get('id');
    const spToken = request.headers.get('x-spotify-token') || '';
    const spCookie = request.headers.get('x-spotify-cookie') || '';

    if (!playlistId) {
        return NextResponse.json({ error: 'Playlist ID required' }, { status: 400 });
    }

    try {
        const tracks = await spotifyGetPlaylistTracks(playlistId, { token: spToken, spDc: spCookie });
        return NextResponse.json(tracks);
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Failed to fetch playlist tracks' }, { status: 500 });
    }
}
