import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/lyrics?title=...&artist=...&album=...&duration=...
 * Proxies lyrics requests to LRCLIB with fallback search
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const title = searchParams.get('title') || searchParams.get('track_name') || '';
    const artist = searchParams.get('artist') || searchParams.get('artist_name') || '';
    const album = searchParams.get('album') || searchParams.get('album_name') || '';
    const duration = searchParams.get('duration') || '';

    if (!title) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    try {
        // 1. Try exact get
        const params = new URLSearchParams({
            track_name: title,
            ...(artist ? { artist_name: artist } : {}),
            ...(album ? { album_name: album } : {}),
            ...(duration ? { duration: Math.round(parseFloat(duration)).toString() } : {}),
        });

        const headers = {
            'User-Agent': 'BubbleApp/1.0 (https://github.com/rawnaldclark/Bubble)',
        };

        const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
            headers,
            next: { revalidate: 3600 },
        });

        if (res.ok) {
            const data = await res.json();
            return NextResponse.json({
                synced: data.syncedLyrics || null,
                plain: data.plainLyrics || null,
                instrumental: data.instrumental || false,
            });
        }

        // 2. Fallback: Search endpoint
        const searchParams2 = new URLSearchParams({
            track_name: title,
            ...(artist ? { artist_name: artist } : {}),
        });

        const searchRes = await fetch(`https://lrclib.net/api/search?${searchParams2.toString()}`, {
            headers,
            next: { revalidate: 3600 },
        });

        if (searchRes.ok) {
            const list = await searchRes.json();
            if (Array.isArray(list) && list.length > 0) {
                // Find best matching item
                const best = list.find((item: any) => item.syncedLyrics || item.plainLyrics) || list[0];
                return NextResponse.json({
                    synced: best.syncedLyrics || null,
                    plain: best.plainLyrics || null,
                    instrumental: best.instrumental || false,
                });
            }
        }

        return NextResponse.json({ synced: null, plain: null, instrumental: false });
    } catch (err: any) {
        console.error('[Lyrics API Error]', err.message);
        return NextResponse.json({ synced: null, plain: null, error: err.message }, { status: 500 });
    }
}
