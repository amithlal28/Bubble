import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

/** GET /api/liked — List liked tracks */
export async function GET(request: Request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    const { data: tracks, error, count } = await supabase
        .from('user_liked_tracks')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('liked_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        tracks: tracks || [],
        total: count || 0,
        limit,
        offset,
    });
}

/** POST /api/liked — Like a track */
export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Batch mode: { tracks: [...] } — one round trip for many likes (fast sync).
    if (Array.isArray(body.tracks)) {
        const nowIso = new Date().toISOString();
        const rows = body.tracks
            .filter((t: any) => (t.track_id || t.id) && t.title && t.artist)
            .map((t: any) => ({
                user_id: user.id,
                track_id: t.track_id || t.id,
                title: t.title,
                artist: t.artist,
                album: t.album || '',
                duration: t.duration || 0,
                artwork_url: t.artwork_url || '',
                source: t.source || 'local',
                source_id: t.source_id || '',
                arcod_id: t.arcod_id || '',
                youtube_id: t.youtube_id || '',
                quality: t.quality || 'flac',
                liked_at: nowIso,
            }));

        if (rows.length === 0) return NextResponse.json({ success: true, count: 0 });

        const { error } = await supabase
            .from('user_liked_tracks')
            .upsert(rows, { onConflict: 'user_id,track_id' });

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true, count: rows.length }, { status: 201 });
    }

    const { track_id, title, artist, album, duration, artwork_url, source, source_id, arcod_id, youtube_id, quality } = body;

    if (!track_id || !title || !artist) {
        return NextResponse.json({ error: 'track_id, title, and artist are required' }, { status: 400 });
    }

    const { data: liked, error } = await supabase
        .from('user_liked_tracks')
        .upsert({
            user_id: user.id,
            track_id,
            title,
            artist,
            album: album || '',
            duration: duration || 0,
            artwork_url: artwork_url || '',
            source: source || 'local',
            source_id: source_id || '',
            arcod_id: arcod_id || '',
            youtube_id: youtube_id || '',
            quality: quality || 'flac',
            liked_at: new Date().toISOString(),
        }, { onConflict: 'user_id,track_id' })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ...liked, is_liked: true }, { status: 201 });
}

/** DELETE /api/liked — Unlike a track */
export async function DELETE(request: Request) {
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

    const { error } = await supabase
        .from('user_liked_tracks')
        .delete()
        .eq('user_id', user.id)
        .eq('track_id', trackId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, is_liked: false });
}
