const ARCOD_SUPABASE_URL = 'https://fnlghyzwyoklfqyhqlav.supabase.co';
const ARCOD_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubGdoeXp3eW9rbGZxeWhxbGF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDExODAsImV4cCI6MjA4OTY3NzE4MH0.9J1-JK1jJYunBM6bF-_MLR5UvhDV4BibXordTOzH2_0';

async function test() {
    // Try to login to a generic account created in the past before email confirmation was required
    // or we can test an anonymous sign in?
    const res = await fetch(`${ARCOD_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': ARCOD_ANON_KEY },
        body: JSON.stringify({ email: `test1@bbl.local`, password: 'bbl-web-stream' }),
    });
    console.log('test1:', res.status, await res.text());

    // What if we try anonymous login?
    const res2 = await fetch(`${ARCOD_SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': ARCOD_ANON_KEY },
        body: JSON.stringify({}),
    });
    console.log('anon:', res2.status, await res2.text());
}
test();
