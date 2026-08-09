import { NextResponse } from 'next/server';
import { spotifyGetProfile } from '@/lib/spotify';

export async function GET(request: Request) {
    const spToken = request.headers.get('x-spotify-token') || '';
    const spCookie = request.headers.get('x-spotify-cookie') || '';
    if (!spToken && !spCookie) {
        return NextResponse.json({ error: 'Spotify token or cookie required' }, { status: 401 });
    }

    try {
        const profile = await spotifyGetProfile({ token: spToken, spDc: spCookie });
        if (!profile) {
            return NextResponse.json({ error: 'Invalid or expired Spotify session' }, { status: 401 });
        }
        return NextResponse.json(profile);
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Failed to fetch Spotify profile' }, { status: 500 });
    }
}
