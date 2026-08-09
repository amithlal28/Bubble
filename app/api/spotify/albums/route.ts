import { NextResponse } from 'next/server';
import { spotifyGetAlbumTracks, spotifySaveAlbum, spotifyFollowPlaylist } from '@/lib/spotify';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const albumId = searchParams.get('id');
    const spToken = request.headers.get('x-spotify-token') || '';
    const spCookie = request.headers.get('x-spotify-cookie') || '';

    if (!albumId) {
        return NextResponse.json({ error: 'Album ID required' }, { status: 400 });
    }

    try {
        const tracks = await spotifyGetAlbumTracks(albumId, { token: spToken, spDc: spCookie });
        return NextResponse.json(tracks);
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Failed to fetch album tracks' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const spToken = request.headers.get('x-spotify-token') || '';
    const spCookie = request.headers.get('x-spotify-cookie') || '';
    if (!spToken && !spCookie) {
        return NextResponse.json({ error: 'Spotify token or cookie required' }, { status: 401 });
    }

    try {
        const { action, id } = await request.json();
        if (action === 'save_album') {
            const res = await spotifySaveAlbum({ token: spToken, spDc: spCookie }, id);
            return NextResponse.json(res);
        } else if (action === 'follow_playlist') {
            const res = await spotifyFollowPlaylist({ token: spToken, spDc: spCookie }, id);
            return NextResponse.json(res);
        }
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Action failed' }, { status: 500 });
    }
}
