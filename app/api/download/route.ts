import { NextRequest, NextResponse } from 'next/server';
import { validateStreamUrl } from '@/lib/stream-guard';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Same fail-closed key the proxy uses, for ARCOD direct-stream downloads.
const ARCOD_STASH_KEY = process.env.ARCOD_STASH_KEY || '';

function sanitizeFilename(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

// The client hands us stream URLs already wrapped as /api/stream/proxy?url=...
// (same-origin). Recover the real upstream URL so we can validate + fetch it.
function unwrapProxyUrl(raw: string): string {
    if (raw.includes('/api/stream/proxy')) {
        try {
            const inner = new URL(raw, 'http://internal').searchParams.get('url');
            if (inner) return inner;
        } catch { /* fall through — validate the raw value instead */ }
    }
    return raw;
}

/**
 * GET /api/download?url=<audio_url>&title=<title>&artist=<artist>&format=<flac|mp3>
 * Streams the audio file directly as a browser attachment download.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const rawUrl = searchParams.get('url');
    const title = searchParams.get('title') || 'Track';
    const artist = searchParams.get('artist') || 'Unknown Artist';
    const format = searchParams.get('format') || 'flac';

    if (!rawUrl) {
        return NextResponse.json({ error: 'Missing audio URL parameter' }, { status: 400 });
    }

    // SSRF guard: only https URLs pointing at known audio hosts are fetched.
    const guard = validateStreamUrl(unwrapProxyUrl(rawUrl));
    if (!guard.ok) {
        return NextResponse.json({ error: `Blocked URL: ${guard.reason}` }, { status: 400 });
    }
    const audioUrl = guard.url;

    try {
        const upstreamHeaders: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
        };
        // ARCOD direct streams (not R2/S3 storage) require origin + stash auth.
        if (audioUrl.includes('arcod.xyz') && !audioUrl.includes('cloudflarestorage.com')) {
            upstreamHeaders['Origin'] = 'https://arcod.xyz';
            upstreamHeaders['Referer'] = 'https://arcod.xyz/';
            if (ARCOD_STASH_KEY) upstreamHeaders['X-Stash-Key'] = ARCOD_STASH_KEY;
        }

        const upstream = await fetch(audioUrl, { headers: upstreamHeaders });

        if (!upstream.ok || !upstream.body) {
            return NextResponse.json(
                { error: `Upstream download failed: ${upstream.statusText}` },
                { status: upstream.status }
            );
        }

        const ext = format.startsWith('.') ? format.slice(1) : format;
        const filename = sanitizeFilename(`${artist} - ${title}.${ext}`);
        const contentType = ext === 'flac' ? 'audio/flac' : ext === 'mp3' ? 'audio/mpeg' : 'application/octet-stream';

        const headers = new Headers();
        headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
        headers.set('Content-Type', upstream.headers.get('content-type') || contentType);

        const contentLength = upstream.headers.get('content-length');
        if (contentLength) {
            headers.set('Content-Length', contentLength);
        }

        return new Response(upstream.body as any, {
            status: 200,
            headers,
        });
    } catch (err: any) {
        console.error('[Download Route Error]', err);
        return NextResponse.json({ error: err.message || 'Download stream failed' }, { status: 500 });
    }
}
