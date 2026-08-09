async function test() {
    const videoId = '60ItHLz5WEA';
    try {
        const res = await fetch('https://co.wuk.sh/api/json', { // Alternative cobalt instance or default
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: 'https://youtube.com/watch?v=' + videoId,
                isAudioOnly: true
            })
        });
        const data = await res.json();
        console.log('Cobalt response:', data);
    } catch(e) {
        console.log('Error:', e.message);
    }
}
test();
