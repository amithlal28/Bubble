import { NextResponse } from 'next/server';

/**
 * GET /api/arcod/stream/[trackId]?quality=27
 * Attempts to get a lossless FLAC stream URL from ARCOD.
 * Strategy: try v2/stash/stream first, then fall back to job-based rendering.
 */
export async function GET(
    request: Request,
    { params }: { params: { trackId: string } }
) {
    const { searchParams } = new URL(request.url);
    const trackId = params.trackId.replace('arcod_', '');
    const quality = searchParams.get('quality') || '27';

    if (!trackId) {
        return NextResponse.json({ error: 'Track ID required' }, { status: 400 });
    }

    // Try the fast stream endpoint first (needs X-Stash-Key)
    try {
        const stashKey = process.env.ARCOD_STASH_KEY || '';
        const headers: Record<string, string> = {
            'Accept': 'application/json',
            'Origin': 'https://arcod.xyz',
            'Referer': 'https://arcod.xyz/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        };
        if (stashKey) {
            headers['X-Stash-Key'] = stashKey;
        }

        const res = await fetch(
            `https://api.arcod.xyz/v2/stash/stream/${encodeURIComponent(trackId)}?quality=${quality}`,
            {
                headers,
                signal: AbortSignal.timeout(15000),
            }
        );

        if (res.ok) {
            const body = await res.text();
            const trimmed = body.trim();

            // Plain text URL response
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                return NextResponse.json({ url: trimmed, source: 'arcod', quality: 'FLAC' });
            }

            // JSON response
            try {
                const json = JSON.parse(trimmed);
                const data = json.data || json;
                const url = data.url || data.streamUrl || data.downloadUrl;
                if (url) {
                    return NextResponse.json({ url, source: 'arcod', quality: 'FLAC' });
                }
            } catch {
                // fall through
            }
        }
    } catch (err: any) {
        console.warn('[ARCOD Stream] Fast stream failed:', err.message);
    }

    // Fallback: try to create a render job
    try {
        const jobRes = await fetch('https://arcod.xyz/api/v2/downloads', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'https://arcod.xyz',
                'Referer': 'https://arcod.xyz/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            body: JSON.stringify({
                albumId: '0000000000000',
                trackId,
                albumTitle: 'Single',
                artistName: 'Artist',
                artistId: '0',
                coverUrl: '',
                releaseDate: '',
                tracksCount: 1,
                quality: parseInt(quality) || 27,
                format: 'FLAC',
                bitrate: 320,
                embedLyrics: false,
                lyricsMode: 'none',
                downloadBooklet: false,
                attachCover: false,
                zipName: '{track} - {name}',
                trackName: '{track} - {name}',
            }),
            signal: AbortSignal.timeout(20000),
        });

        if (jobRes.ok) {
            const jobData = await jobRes.json();
            const url = jobData?.downloadUrl || jobData?.url;
            if (url) {
                return NextResponse.json({ url, source: 'arcod', quality: 'FLAC' });
            }

            const jobId = jobData?.id || jobData?.jobId;
            if (jobId) {
                // Job created — poll for completion
                for (let i = 0; i < 10; i++) {
                    await new Promise(r => setTimeout(r, 3000));

                    const pollRes = await fetch(`https://arcod.xyz/api/v2/downloads/${jobId}`, {
                        headers: {
                            'Accept': 'application/json',
                            'Origin': 'https://arcod.xyz',
                            'Referer': 'https://arcod.xyz/',
                            'User-Agent': 'Mozilla/5.0',
                        },
                        signal: AbortSignal.timeout(10000),
                    });

                    if (pollRes.ok) {
                        const pollData = await pollRes.json();
                        const pollUrl = pollData?.downloadUrl || pollData?.url || pollData?.data?.url;
                        if (pollUrl) {
                            return NextResponse.json({ url: pollUrl, source: 'arcod', quality: 'FLAC' });
                        }
                        if (pollData?.status === 'failed') break;
                    }
                }
            }
        }
    } catch (err: any) {
        console.warn('[ARCOD Stream] Job fallback failed:', err.message);
    }

    // Nothing worked
    return NextResponse.json({ error: 'No stream available for this track' }, { status: 404 });
}
