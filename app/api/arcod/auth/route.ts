import { NextResponse } from 'next/server';

/**
 * GET /api/arcod/auth — Redirects user to ARCOD's Supabase login
 * After login, Supabase redirects back to /api/arcod/callback
 */
export async function GET() {
    const supabaseUrl = 'https://fnlghyzwyoklfqyhqlav.supabase.co';
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/arcod/callback`;

    // Use Supabase's built-in OAuth/email auth URL
    const authUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;

    // For email-based login, redirect to ARCOD directly (they handle the auth UI)
    const arcodLoginUrl = `https://arcod.xyz/?redirect=${encodeURIComponent(redirectTo)}`;

    // Try ARCOD's own login page first; fall back to Supabase auth
    return NextResponse.redirect(arcodLoginUrl);
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action, email, password } = body;
        
        if (!email || !password) {
            return NextResponse.json({ success: false, error: 'Email and password required' }, { status: 400 });
        }

        const supabaseUrl = 'https://fnlghyzwyoklfqyhqlav.supabase.co';
        const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubGdoeXp3eW9rbGZxeWhxbGF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDExODAsImV4cCI6MjA4OTY3NzE4MH0.9J1-JK1jJYunBM6bF-_MLR5UvhDV4BibXordTOzH2_0';

        let url = '';
        let payload = {};

        if (action === 'signup') {
            url = `${supabaseUrl}/auth/v1/signup`;
            payload = { email, password };
        } else {
            url = `${supabaseUrl}/auth/v1/token?grant_type=password`;
            payload = { email, password };
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': anonKey,
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        
        if (!res.ok) {
            return NextResponse.json({ success: false, error: data.error_description || data.msg || 'Authentication failed' });
        }

        // Format session to match what callback provides
        const session = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
            userEmail: data.user?.email || email
        };

        return NextResponse.json({ success: true, session });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message || 'Server error' }, { status: 500 });
    }
}
