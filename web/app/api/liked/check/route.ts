import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

/** GET /api/liked/check — Check if a track is liked by the current user */
export async function GET(request: Request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const trackId = searchParams.get('track_id');

    if (!trackId) {
        return NextResponse.json({ error: 'track_id query parameter is required' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('user_liked_tracks')
        .select('track_id')
        .eq('user_id', user.id)
        .eq('track_id', trackId)
        .maybeSingle();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ liked: !!data });
}
