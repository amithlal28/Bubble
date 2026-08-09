const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const ARCOD_API_BASE = 'https://arcod.xyz/api';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubGdoeXp3eW9rbGZxeWhxbGF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDExODAsImV4cCI6MjA4OTY3NzE4MH0.9J1-JK1jJYunBM6bF-_MLR5UvhDV4BibXordTOzH2_0';

async function testFresh(refreshToken, trackId) {
    console.log('1. Refreshing token...');
    const res = await fetch('https://fnlghyzwyoklfqyhqlav.supabase.co/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ refresh_token: refreshToken })
    });
    const refreshed = await res.json();
    const token = refreshed.access_token;
    console.log('Got fresh token:', token ? (token.substring(0, 30) + '...') : 'undefined');

    const h = {
        'Content-Type': 'application/json',
        'Origin': 'https://arcod.xyz',
        'Referer': 'https://arcod.xyz/',
        'User-Agent': UA,
        'Authorization': 'Bearer ' + token
    };

    console.log('2. Creating download job...');
    const r = await fetch(ARCOD_API_BASE + '/v2/downloads', {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
            albumId: '0000000000000',
            trackId: String(trackId),
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
    console.log('Download Job init HTTP Status:', r.status);
    const d = await r.json();
    console.log('Download Job init response:', JSON.stringify(d, null, 2));

    if (d.id || d.jobId) {
        const jobId = d.id || d.jobId;
        console.log('Polling job:', jobId);
        for (let i = 0; i < 15; i++) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            const p = await fetch(`${ARCOD_API_BASE}/v2/downloads/${jobId}`, { headers: h });
            const poll = await p.json();
            console.log('Poll state:', poll.state || poll.status);
            if (poll.state === 'completed' || poll.status === 'completed' || poll.downloadUrl) {
                const u = await fetch(`${ARCOD_API_BASE}/v2/downloads/${jobId}/url`, { method: 'POST', headers: h });
                console.log('Final URL response:', await u.json());
                break;
            }
        }
    }
}

// Using the new refresh token obtained from the previous refresh
testFresh('qogxc3nlmn6h', '149793130');
