async function test() {
    const videoId = '60ItHLz5WEA';
    const urls = [
        `https://invidious.flokinet.to/latest_version?id=${videoId}&itag=140`,
        `https://yt.artemislena.eu/latest_version?id=${videoId}&itag=140`
    ];
    for (const u of urls) {
        try {
            const res = await fetch(u, { method: 'HEAD' });
            console.log(u, res.status);
            if (res.status === 200 || res.status === 302) {
                console.log('✅ Works!');
            }
        } catch(e) {
            console.log('Error:', e.message);
        }
    }
}
test();
