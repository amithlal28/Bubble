import { NextResponse } from 'next/server';
import { spotifySetLibrary } from '@/lib/spotify';

export async function POST(request: Request) {
    const spToken = request.headers.get('x-spotify-token') || '';
    const spCookie = request.headers.get('x-spotify-cookie') || '';
    if (!spToken && !spCookie) {
        return NextResponse.json({ error: 'Spotify token or cookie required' }, { status: 401 });
    }

    try {
        const { uris, add } = await request.json();
        const success = await spotifySetLibrary({ token: spToken, spDc: spCookie }, uris, add);
        return NextResponse.json({ success });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Failed to update library' }, { status: 500 });
    }
}
