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
