/**
 * copy-assets.js — Syncs shared CSS/JS/assets from the parent Bubble project
 * into web/public/ so Next.js can serve them.
 *
 * Run: node copy-assets.js
 * (Also runs automatically before `next dev` and `next build` via package.json scripts)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.resolve(__dirname, 'public');

const COPY_MAP = [
    // CSS files
    { from: 'css/index.css', to: 'css/index.css' },
    { from: 'css/player.css', to: 'css/player.css' },
    { from: 'css/library.css', to: 'css/library.css' },
    { from: 'css/settings.css', to: 'css/settings.css' },
    // JS files
    { from: 'js/api.js', to: 'js/api.js' },
    { from: 'js/app.js', to: 'js/app.js' },
    { from: 'js/database.js', to: 'js/database.js' },
    { from: 'js/downloader.js', to: 'js/downloader.js' },
    { from: 'js/library.js', to: 'js/library.js' },
    { from: 'js/lyrics.js', to: 'js/lyrics.js' },
    { from: 'js/player.js', to: 'js/player.js' },
    { from: 'js/router.js', to: 'js/router.js' },
    { from: 'js/settings.js', to: 'js/settings.js' },
    { from: 'js/spotify.js', to: 'js/spotify.js' },
    { from: 'js/sync.js', to: 'js/sync.js' },
    { from: 'js/youtube.js', to: 'js/youtube.js' },
    // Vendor
    { from: 'js/vendor/howler.min.js', to: 'js/vendor/howler.min.js' },
    // Views
    { from: 'js/views/home.js', to: 'js/views/home.js' },
    { from: 'js/views/library.js', to: 'js/views/library.js' },
    { from: 'js/views/search.js', to: 'js/views/search.js' },
    { from: 'js/views/playlist.js', to: 'js/views/playlist.js' },
    { from: 'js/views/album.js', to: 'js/views/album.js' },
    { from: 'js/views/artist.js', to: 'js/views/artist.js' },
    { from: 'js/views/downloads.js', to: 'js/views/downloads.js' },
    { from: 'js/views/settings.js', to: 'js/views/settings.js' },
    { from: 'js/views/sync.js', to: 'js/views/sync.js' },
    { from: 'js/views/nowplaying.js', to: 'js/views/nowplaying.js' },
    { from: 'js/views/queue.js', to: 'js/views/queue.js' },
    { from: 'js/views/lyrics.js', to: 'js/views/lyrics.js' },
    // Assets
    { from: 'assets/icon.png', to: 'assets/icon.png' },
];

let copied = 0;
let skipped = 0;

for (const { from, to } of COPY_MAP) {
    const src = path.join(ROOT, from);
    const dest = path.join(PUBLIC, to);

    if (!fs.existsSync(src)) {
        console.warn(`  ⚠ Skipping (not found): ${from}`);
        skipped++;
        continue;
    }

    // Ensure destination directory exists
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    // Only copy if source is newer
    const srcStat = fs.statSync(src);
    if (fs.existsSync(dest)) {
        const destStat = fs.statSync(dest);
        if (destStat.mtimeMs >= srcStat.mtimeMs) {
            skipped++;
            continue;
        }
    }

    fs.copyFileSync(src, dest);
    copied++;
    console.log(`  ✓ ${from} → public/${to}`);
}

console.log(`\nDone: ${copied} copied, ${skipped} skipped, ${COPY_MAP.length} total`);
