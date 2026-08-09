import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

/** Recompute a playlist's track_count from the actual row count and bump updated_at. */
async function syncPlaylistCount(supabase: any, playlistId: string) {
    const { count } = await supabase
        .from('user_playlist_tracks')
        .select('*', { count: 'exact', head: true })
        .eq('playlist_id', playlistId);

    await supabase
        .from('user_playlists')
        .update({ updated_at: new Date().toISOString(), track_count: count || 0 })
        .eq('id', playlistId);
}

/** POST /api/playlists/[id]/tracks — Add track to playlist */
export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const playlistId = params.id;

    // Verify playlist ownership
    const { data: playlist, error: playlistError } = await supabase
        .from('user_playlists')
        .select('id')
        .eq('id', playlistId)
        .eq('user_id', user.id)
        .single();

    if (playlistError || !playlist) {
        return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    const body = await request.json();

    // Batch mode: { tracks: [...] }
    if (body.tracks && Array.isArray(body.tracks)) {
        const rows = body.tracks.map((t: any, i: number) => ({
            playlist_id: playlistId,
            track_id: t.track_id || t.id || '',
            title: t.title || 'Unknown',
            artist: t.artist || 'Unknown',
            album: t.album || '',
            duration: t.duration || 0,
            artwork_url: t.artwork_url || '',
            source: t.source || 'spotify',
            source_id: t.source_id || '',
            arcod_id: t.arcod_id || '',
            youtube_id: t.youtube_id || '',
            quality: t.quality || 'flac',
            position: t.position ?? i,
        }));

        const { error } = await supabase
            .from('user_playlist_tracks')
            .upsert(rows, { onConflict: 'playlist_id,track_id' });

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Recompute count from actual rows (upsert dedupes on playlist_id,track_id).
        await syncPlaylistCount(supabase, playlistId);

        return NextResponse.json({ success: true, count: rows.length });
    }

    // Single track mode
    const { track_id, title, artist, album, duration, artwork_url, source, source_id, arcod_id, youtube_id, quality, position } = body;

    if (!track_id || !title || !artist) {
        return NextResponse.json({ error: 'track_id, title, and artist are required' }, { status: 400 });
    }

    const { data: track, error } = await supabase
        .from('user_playlist_tracks')
        .upsert({
            playlist_id: playlistId,
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
            position: position ?? 0,
        }, { onConflict: 'playlist_id,track_id' })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Recompute count from actual rows and bump updated_at.
    await syncPlaylistCount(supabase, playlistId);

    return NextResponse.json(track, { status: 201 });
}

/** DELETE /api/playlists/[id]/tracks — Remove track from playlist */
export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const playlistId = params.id;
    const { searchParams } = new URL(request.url);
    const trackId = searchParams.get('track_id');

    if (!trackId) {
        return NextResponse.json({ error: 'track_id query parameter is required' }, { status: 400 });
    }

    // Verify playlist ownership
    const { data: playlist, error: playlistError } = await supabase
        .from('user_playlists')
        .select('id')
        .eq('id', playlistId)
        .eq('user_id', user.id)
        .single();

    if (playlistError || !playlist) {
        return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    const { error } = await supabase
        .from('user_playlist_tracks')
        .delete()
        .eq('playlist_id', playlistId)
        .eq('track_id', trackId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Recompute count from actual rows and bump updated_at.
    await syncPlaylistCount(supabase, playlistId);

    return NextResponse.json({ success: true });
}
