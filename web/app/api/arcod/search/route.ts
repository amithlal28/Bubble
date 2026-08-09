import { NextResponse } from 'next/server';

/**
 * GET /api/arcod/search?q=...&limit=20
 * Proxies ARCOD's public get-music endpoint. No authentication required.
 * Returns formatted tracks ready for the Bubble player.
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const limit = searchParams.get('limit') || '20';

    if (!q || !q.trim()) {
        return NextResponse.json({ tracks: [] });
    }

    try {
        const userToken = request.headers.get('x-arcod-token') || '';
        const headers: any = {
            'Accept': 'application/json',
            'Origin': 'https://arcod.xyz',
            'Referer': 'https://arcod.xyz/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        };
        if (userToken) {
            headers['Authorization'] = 'Bearer ' + userToken;
        }

        const res = await fetch(
            `https://arcod.xyz/api/get-music?q=${encodeURIComponent(q.trim())}&offset=0`,
            {
                headers,
                signal: AbortSignal.timeout(10000),
            }
        );

        if (!res.ok) {
            console.warn('[ARCOD Proxy] get-music returned', res.status);
            return NextResponse.json({ tracks: [] });
        }

        const data = await res.json();
        const items = data?.data?.tracks?.items || data?.tracks?.items || [];

        const tracks = items.map((t: any) => ({
            id: `arcod_${t.id || t.track_id || ''}`,
            title: t.title || t.name || 'Unknown Title',
            artist: t.performer?.name || t.album?.artist?.name || t.artist?.name || 'Unknown Artist',
            album: t.album?.title || t.album?.name || '',
            duration: t.duration || 0,
            artwork_url: t.album?.image?.large || t.album?.image?.small || '',
            source: 'arcod',
            source_id: String(t.id || t.track_id || ''),
            arcod_id: String(t.id || t.track_id || ''),
            quality: `${t.maximum_bit_depth || 24}-Bit FLAC (${t.maximum_sampling_rate || 96}kHz Qobuz via ARCOD)`,
            isrc: t.isrc || null,
        }));

        return NextResponse.json({ tracks });
    } catch (err: any) {
        console.error('[ARCOD Proxy] Search error:', err.message);
        return NextResponse.json({ tracks: [], error: err.message });
    }
}
