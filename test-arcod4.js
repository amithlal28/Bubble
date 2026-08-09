const ARCOD_API_BASE = 'https://arcod.xyz/api';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubGdoeXp3eW9rbGZxeWhxbGF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDExODAsImV4cCI6MjA4OTY3NzE4MH0.9J1-JK1jJYunBM6bF-_MLR5UvhDV4BibXordTOzH2_0';

async function testFresh() {
    const res = await fetch('https://fnlghyzwyoklfqyhqlav.supabase.co/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ refresh_token: 'xmmuolcmjru7' })
    });
    if (!res.ok) {
        console.log('Failed refresh:', res.status, await res.text());
        return;
    }
    const data = await res.json();
    console.log('✅ Token refreshed successfully!', data.access_token.substring(0, 30) + '...');

    const h = {
        'Content-Type': 'application/json',
        'Origin': 'https://arcod.xyz',
        'Referer': 'https://arcod.xyz/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Authorization': 'Bearer ' + data.access_token
    };

    console.log('Testing job init with track 149793130...');
    const r = await fetch(ARCOD_API_BASE + '/v2/downloads', {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
            albumId: '0000000000000',
            trackId: '149793130',
            albumTitle: 'Test Single',
            artistName: 'Test Artist',
            artistId: '0',
            coverUrl: '',
            releaseDate: '',
            tracksCount: 1,
            quality: 27,
            format: 'FLAC',
            bitrate: 320,
            embedLyrics: false,
            lyricsMode: 'none',
            downloadBooklet: false,
            attachCover: false,
            zipName: '{track} - {name}',
            trackName: '{track} - {name}'
        })
    });
    console.log('Job response:', r.status);
    const d = await r.json();
    console.log(d.downloadUrl || d.id ? '✅ Job created/URL returned!' : d);
}
testFresh();
