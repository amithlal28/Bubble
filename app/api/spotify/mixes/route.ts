import { NextResponse } from 'next/server';
import { spotifyGetMixes } from '@/lib/spotify';

export async function GET(request: Request) {
    const spToken = request.headers.get('x-spotify-token') || '';
    const spCookie = request.headers.get('x-spotify-cookie') || '';
    if (!spToken && !spCookie) {
        return NextResponse.json({ error: 'Spotify token or cookie required' }, { status: 401 });
    }

    try {
        const mixes = await spotifyGetMixes({ token: spToken, spDc: spCookie });
        return NextResponse.json(mixes);
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Failed to fetch mixes' }, { status: 500 });
    }
}
