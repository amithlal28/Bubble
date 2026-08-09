import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // Refresh session if expired — important for persistent auth
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Protected routes: redirect to /login if not authenticated
    const protectedPaths = ['/api/playlists', '/api/liked', '/api/tracks'];
    const isProtected = protectedPaths.some((p) =>
        request.nextUrl.pathname.startsWith(p)
    );

    if (isProtected && !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // If logged in and visiting /login, redirect to home
    if (user && request.nextUrl.pathname === '/login') {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization)
         * - favicon.ico (favicon)
         * - /css/* (stylesheets)
         * - /js/* (scripts)
         * - /assets/* (static assets)
         * - Image files
         */
        '/((?!_next/static|_next/image|favicon.ico|css/|js/|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
    ],
};
