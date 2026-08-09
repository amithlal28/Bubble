import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Bubble',
    description:
        'Your Spotify + YouTube Music library, in FLAC. Free and open source.',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                {/* Set proper favicon */}
                <link rel="icon" href="/icon.png" />
                {/* Preconnect for fonts */}
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link
                    rel="preconnect"
                    href="https://fonts.gstatic.com"
                    crossOrigin="anonymous"
                />
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
                    rel="stylesheet"
                />
                {/* CSS must load before JS so CSS vars are available */}
                <link rel="stylesheet" href="/css/index.css" />
                <link rel="stylesheet" href="/css/player.css" />
                <link rel="stylesheet" href="/css/library.css" />
                <link rel="stylesheet" href="/css/settings.css" />
                <link rel="stylesheet" href="/css/web.css" />
                {/* Scripts loaded with defer — execute in order after HTML parse */}
                {/* Order MUST match Electron index.html: router BEFORE views */}
                <script src="/js/polyfill.js" defer />
                <script src="/js/vendor/howler.min.js" defer />
                <script src="/js/api.js" defer />
                <script src="/js/database.js" defer />
                <script src="/js/router.js" defer />
                <script src="/js/player.js" defer />
                <script src="/js/spotify.js" defer />
                <script src="/js/youtube.js" defer />
                <script src="/js/library.js" defer />
                <script src="/js/downloader.js" defer />
                <script src="/js/lyrics.js" defer />
                <script src="/js/sync.js" defer />
                <script src="/js/settings.js" defer />
                {/* Views — must load after router.js */}
                <script src="/js/views/home.js" defer />
                <script src="/js/views/library.js" defer />
                <script src="/js/views/playlist.js" defer />
                <script src="/js/views/downloads.js" defer />
                <script src="/js/views/settings.js" defer />
                <script src="/js/views/nowplaying.js" defer />
                <script src="/js/views/queue.js" defer />
                <script src="/js/views/lyrics.js" defer />
                <script src="/js/views/search.js" defer />
                <script src="/js/views/album.js" defer />
                <script src="/js/views/artist.js" defer />
                <script src="/js/views/sync.js" defer />
                <script src="/js/app.js" defer />
            </head>
            <body>{children}</body>
        </html>
    );
}
