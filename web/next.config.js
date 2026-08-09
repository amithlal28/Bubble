/** @type {import('next').NextConfig} */
const nextConfig = {
    // Serve parent project's CSS/JS/assets from public/ directory
    // Run `node copy-assets.js` before dev/build to sync them
    async rewrites() {
        return [];
    },
    // Allow serving audio files
    async headers() {
        return [
            {
                source: '/audio/:path*',
                headers: [
                    { key: 'Content-Type', value: 'audio/flac' },
                    { key: 'Accept-Ranges', value: 'bytes' },
                ],
            },
        ];
    },
};

module.exports = nextConfig;
