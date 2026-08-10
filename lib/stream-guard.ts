// Shared allow-list guard for the audio proxy + download routes.
// Prevents the open-proxy / SSRF class of bug: only https URLs pointing at
// known audio hosts are allowed, and literal private / link-local addresses
// are rejected outright.

const ALLOWED_HOST_SUFFIXES = [
    'arcod.xyz',              // ARCOD API + direct streams
    'cloudflarestorage.com',  // Cloudflare R2 (ARCOD FLAC storage)
    'r2.dev',                 // Cloudflare R2 public buckets
    'sndcdn.com',             // SoundCloud CDN
    'soundcloud.com',         // SoundCloud API (progressive redirect)
    'googlevideo.com',        // YouTube audio (via Piped)
    'kavin.rocks',            // Piped instance we use as fallback
    'private.coffee',         // Piped instance we use as fallback
];

function isPrivateIp(host: string): boolean {
    const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) {
        const a = parseInt(v4[1], 10), b = parseInt(v4[2], 10);
        if (a === 10 || a === 127 || a === 0) return true;
        if (a === 169 && b === 254) return true;          // link-local (169.254.169.254)
        if (a === 172 && b >= 16 && b <= 31) return true;  // private
        if (a === 192 && b === 168) return true;           // private
        if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
        if (a >= 224) return true;                         // multicast / reserved
        return false;
    }
    if (host.includes(':')) { // IPv6 literal
        const h = host.replace(/^\[|\]$/g, '').toLowerCase();
        if (h === '::1' || h === '::') return true;
        if (h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd')) return true;
        if (h.startsWith('::ffff:')) return true; // IPv4-mapped
        return false;
    }
    return false;
}

type GuardResult = { ok: true; url: string } | { ok: false; reason: string };

export function validateStreamUrl(raw: string | null | undefined): GuardResult {
    if (!raw) return { ok: false, reason: 'missing url' };
    let u: URL;
    try { u = new URL(raw); } catch { return { ok: false, reason: 'invalid url' }; }
    if (u.protocol !== 'https:') return { ok: false, reason: 'https required' };
    const host = u.hostname.toLowerCase();
    if (isPrivateIp(host)) return { ok: false, reason: 'private address blocked' };
    const allowed = ALLOWED_HOST_SUFFIXES.some(s => host === s || host.endsWith('.' + s));
    if (!allowed) return { ok: false, reason: 'host not allowed' };
    return { ok: true, url: u.href };
}
