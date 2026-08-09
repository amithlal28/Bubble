async function test() {
    const res = await fetch('https://api.cobalt.tools/api/json', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            url: 'https://youtube.com/watch?v=60ItHLz5WEA',
            isAudioOnly: true
        })
    });
    console.log(res.status, await res.text());
}
test();
