const ytdl = require('@distube/ytdl-core');

async function test() {
    try {
        const info = await ytdl.getInfo('60ItHLz5WEA');
        const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
        console.log('✅ URL:', format.url.substring(0, 80));
    } catch(e) {
        console.log('Error:', e.message);
    }
}
test();
