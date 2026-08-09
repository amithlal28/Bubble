/**
 * Server-side ARCOD session manager.
 * Authenticates with the ARCOD Supabase project to get tokens for streaming.
 */

const ARCOD_SUPABASE_URL = 'https://fnlghyzwyoklfqyhqlav.supabase.co';
const ARCOD_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubGdoeXp3eW9rbGZxeWhxbGF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDExODAsImV4cCI6MjA4OTY3NzE4MH0.9J1-JK1jJYunBM6bF-_MLR5UvhDV4BibXordTOzH2_0';

let cachedSession = null;
let sessionPromise = null;

async function getArcodSession() {
    // Return cached valid session
    if (cachedSession && cachedSession.expiresAt > Date.now() + 60000) {
        return cachedSession;
    }

    // Avoid concurrent auth requests
    if (sessionPromise) return sessionPromise;

    sessionPromise = (async () => {
        try {
            // Try to sign in anonymously to ARCOD's Supabase project
            const res = await fetch(`${ARCOD_SUPABASE_URL}/auth/v1/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': ARCOD_ANON_KEY,
                },
                body: JSON.stringify({
                    email: `web_${Date.now()}@bubble.local`,
                    password: 'bubble-web-arcod-streaming',
                }),
            });

            if (res.ok) {
                const data = await res.json();
                cachedSession = {
                    accessToken: data.access_token,
                    refreshToken: data.refresh_token,
                    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
                };
                console.log('[ARCOD Auth] Created new session');
                return cachedSession;
            }

            // If signup fails (user exists), try signin
            if (res.status === 422 || res.status === 400) {
                // Try anonymous signin or just use existing
                console.log('[ARCOD Auth] Signup not available, trying anonymous signin...');
                const anonRes = await fetch(`${ARCOD_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': ARCOD_ANON_KEY,
                    },
                    body: JSON.stringify({
                        email: 'web_arcod@bubble.local',
                        password: 'bubble-web-streaming',
                        gotrue_meta_security: {},
                    }),
                });
                if (anonRes.ok) {
                    const data = await anonRes.json();
                    cachedSession = {
                        accessToken: data.access_token,
                        refreshToken: data.refresh_token,
                        expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
                    };
                    return cachedSession;
                }
            }
        } catch (e) {
            console.warn('[ARCOD Auth] Session creation failed:', e.message);
        }

        // Return null — ARCOD streaming will work without auth (search only)
        sessionPromise = null;
        return null;
    })();

    return sessionPromise;
}

module.exports = { getArcodSession };
