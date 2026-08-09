import { NextRequest, NextResponse } from 'next/server';

function sanitizeFilename(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

/**
 * GET /api/download?url=<audio_url>&title=<title>&artist=<artist>&format=<flac|mp3>
 * Streams the audio file directly as a browser attachment download.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const audioUrl = searchParams.get('url');
    const title = searchParams.get('title') || 'Track';
    const artist = searchParams.get('artist') || 'Unknown Artist';
    const format = searchParams.get('format') || 'flac';

    if (!audioUrl) {
        return NextResponse.json({ error: 'Missing audio URL parameter' }, { status: 400 });
    }

    try {
        const upstream = await fetch(audioUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
            },
        });

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
