import { NextResponse } from 'next/server';
import { validateStreamUrl } from '@/lib/stream-guard';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Read from env only — fail closed if unset. (The leaked literal was removed;
// rotate the key in the ARCOD dashboard + set ARCOD_STASH_KEY in Vercel.)
const ARCOD_STASH_KEY = process.env.ARCOD_STASH_KEY || '';

/**
 * GET /api/stream/proxy?url=...
 * Proxies remote FLAC / audio streams to the browser.
 * Handles byte-range requests (HTTP 206), CORS headers, and ARCOD origin/auth requirements.
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const audioUrl = searchParams.get('url');
    const token = searchParams.get('token');

    const guard = validateStreamUrl(audioUrl);
    if (!guard.ok) {
        return NextResponse.json({ error: `Blocked: ${guard.reason}` }, { status: 400 });
    }

    try {
        const targetUrl = guard.url;

        // Forward Range header from the client for seeking and progressive streaming
        const rangeHeader = request.headers.get('range');
        const upstreamHeaders: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': '*/*',
        };

        if (rangeHeader) {
            upstreamHeaders['Range'] = rangeHeader;
        }

        // Only add ARCOD origin headers when querying arcod API endpoints directly (NOT for Cloudflare R2 / S3 storage)
        if (targetUrl.includes('arcod.xyz') && !targetUrl.includes('cloudflarestorage.com')) {
            upstreamHeaders['Origin'] = 'https://arcod.xyz';
            upstreamHeaders['Referer'] = 'https://arcod.xyz/';
            if (ARCOD_STASH_KEY) {
                upstreamHeaders['X-Stash-Key'] = ARCOD_STASH_KEY;
            }
            if (token) {
                upstreamHeaders['Authorization'] = `Bearer ${token}`;
            }
        }

        const upstreamRes = await fetch(targetUrl, {
            headers: upstreamHeaders,
            redirect: 'follow',
        });

        if (!upstreamRes.ok && upstreamRes.status !== 206) {
            console.error(`[Stream Proxy] Upstream returned status ${upstreamRes.status} for ${targetUrl.slice(0, 100)}...`);
            return NextResponse.json({
                error: `Upstream returned status ${upstreamRes.status}`,
            }, { status: upstreamRes.status });
        }

        // Extract relevant content headers
        const responseHeaders = new Headers();
        const contentType = upstreamRes.headers.get('content-type') || 'audio/flac';
        responseHeaders.set('Content-Type', contentType);
        responseHeaders.set('Accept-Ranges', 'bytes');
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        responseHeaders.set('Access-Control-Allow-Headers', 'Range, Authorization, Content-Type');

        const contentLength = upstreamRes.headers.get('content-length');
        if (contentLength) {
            responseHeaders.set('Content-Length', contentLength);
        }

        const contentRange = upstreamRes.headers.get('content-range');
        if (contentRange) {
            responseHeaders.set('Content-Range', contentRange);
        }

        return new Response(upstreamRes.body, {
            status: upstreamRes.status,
            headers: responseHeaders,
        });
    } catch (err: any) {
        console.error('[Stream Proxy] Error streaming audio:', err.message);
        return NextResponse.json({ error: err.message || 'Stream proxy failed' }, { status: 500 });
    }
}

export async function HEAD(request: Request) {
    const { searchParams } = new URL(request.url);
    const audioUrl = searchParams.get('url');

    const guard = validateStreamUrl(audioUrl);
    if (!guard.ok) {
        return new Response(null, { status: 400 });
    }

    try {
        const targetUrl = guard.url;
        const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        };
        if (targetUrl.includes('arcod.xyz') && !targetUrl.includes('cloudflarestorage.com')) {
            headers['Origin'] = 'https://arcod.xyz';
            headers['Referer'] = 'https://arcod.xyz/';
            if (ARCOD_STASH_KEY) headers['X-Stash-Key'] = ARCOD_STASH_KEY;
        }

        const upstreamRes = await fetch(targetUrl, { method: 'HEAD', headers });
        const responseHeaders = new Headers();
        responseHeaders.set('Content-Type', upstreamRes.headers.get('content-type') || 'audio/flac');
        responseHeaders.set('Accept-Ranges', 'bytes');
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        const contentLength = upstreamRes.headers.get('content-length');
        if (contentLength) responseHeaders.set('Content-Length', contentLength);

        return new Response(null, {
            status: upstreamRes.status,
            headers: responseHeaders,
        });
    } catch {
        return new Response(null, { status: 500 });
    }
}

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range, Authorization, Content-Type, X-Stash-Key',
        },
    });
}
