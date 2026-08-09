const ARCOD_SUPABASE_URL = 'https://fnlghyzwyoklfqyhqlav.supabase.co';
const ARCOD_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubGdoeXp3eW9rbGZxeWhxbGF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDExODAsImV4cCI6MjA4OTY3NzE4MH0.9J1-JK1jJYunBM6bF-_MLR5UvhDV4BibXordTOzH2_0';

async function test() {
    const res = await fetch(`${ARCOD_SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': ARCOD_ANON_KEY },
        body: JSON.stringify({ email: `wb_${Date.now()}@bbl.local`, password: 'bbl-web-stream' }),
    });
    console.log(res.status, await res.text());
}
test();
