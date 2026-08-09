import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

/** GET /api/playlists/[id] — Get playlist with tracks */
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const playlistId = params.id;

    // Get playlist
    const { data: playlist, error: playlistError } = await supabase
        .from('user_playlists')
        .select('*')
        .eq('id', playlistId)
        .eq('user_id', user.id)
        .single();

    if (playlistError || !playlist) {
        return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    // Get tracks
    const { data: tracks, error: tracksError } = await supabase
        .from('user_playlist_tracks')
        .select('*')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: true });

    if (tracksError) {
        return NextResponse.json({ error: tracksError.message }, { status: 500 });
    }

    return NextResponse.json({
        ...playlist,
        tracks: tracks || [],
        track_count: tracks?.length || 0,
    });
}

/** PUT /api/playlists/[id] — Update playlist (name, description, artwork) */
export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const playlistId = params.id;
    const body = await request.json();

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.artwork_url !== undefined) updates.artwork_url = body.artwork_url;
    if (body.is_public !== undefined) updates.is_public = body.is_public;

    const { data: playlist, error } = await supabase
        .from('user_playlists')
        .update(updates)
        .eq('id', playlistId)
        .eq('user_id', user.id)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(playlist);
}

/** DELETE /api/playlists/[id] — Delete a Bubble playlist, or hide a synced one.
 *  Synced (Spotify/YouTube) playlists are tombstoned (dismissed=true) so they
 *  vanish from Bubble and are skipped on future syncs, without touching the
 *  user's real streaming account. Local/Bubble playlists are hard-deleted. */
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

    // Look up the playlist to decide delete vs. hide.
    const { data: playlist } = await supabase
        .from('user_playlists')
        .select('id, source, source_id')
        .eq('id', playlistId)
        .eq('user_id', user.id)
        .maybeSingle();

    if (!playlist) {
        return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    const isSynced = (playlist.source === 'spotify' || playlist.source === 'youtube')
        && (playlist.source_id || '').trim() !== '';

    if (isSynced) {
        // Hide (tombstone) — keep the row so its source_id blocks re-import.
        const { error } = await supabase
            .from('user_playlists')
            .update({ dismissed: true, updated_at: new Date().toISOString() })
            .eq('id', playlistId)
            .eq('user_id', user.id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, hidden: true });
    }

    // Local / Bubble playlist — hard delete (cascades to tracks).
    const { error } = await supabase
        .from('user_playlists')
        .delete()
        .eq('id', playlistId)
        .eq('user_id', user.id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
