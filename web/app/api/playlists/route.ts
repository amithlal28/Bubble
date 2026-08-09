import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

/** GET /api/playlists — List user's playlists (excludes dismissed, deduped) */
export async function GET() {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: playlists, error } = await supabase
        .from('user_playlists')
        .select('*')
        .eq('user_id', user.id)
        .or('dismissed.eq.false,dismissed.is.null')
        .order('updated_at', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Defensive dedupe by source_id (handles any pre-migration duplicate rows):
    // keep the first (most recently updated) row per non-empty source_id.
    const seen = new Set<string>();
    const deduped = (playlists || []).filter((p: any) => {
        const sid = (p.source_id || '').trim();
        if (!sid) return true; // local playlists never dedupe
        if (seen.has(sid)) return false;
        seen.add(sid);
        return true;
    });

    return NextResponse.json(deduped);
}

/** POST /api/playlists — Create or upsert playlist */
export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, artwork_url, source_id, source, track_count } = body;

    if (!name || !name.trim()) {
        return NextResponse.json({ error: 'Playlist name is required' }, { status: 400 });
    }

    const cleanSourceId = (source_id || '').trim();

    // Synced playlist (has a real source_id): upsert by (user_id, source_id).
    if (cleanSourceId) {
        const { data: existing } = await supabase
            .from('user_playlists')
            .select('*')
            .eq('user_id', user.id)
            .eq('source_id', cleanSourceId)
            .maybeSingle();

        if (existing) {
            // Respect the tombstone: a dismissed (hidden) playlist must NOT be
            // resurrected by a re-sync. Signal the client to skip it.
            if (existing.dismissed) {
                return NextResponse.json({ ...existing, skipped: true }, { status: 200 });
            }

            const { data: updated, error } = await supabase
                .from('user_playlists')
                .update({
                    name: name.trim(),
                    description: description || '',
                    artwork_url: artwork_url || '',
                    source: source || existing.source || 'spotify',
                    track_count: track_count || 0,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id)
                .select()
                .single();

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json(updated, { status: 200 });
        }

        const { data: created, error } = await supabase
            .from('user_playlists')
            .insert({
                user_id: user.id,
                name: name.trim(),
                description: description || '',
                artwork_url: artwork_url || '',
                source: source || 'spotify',
                source_id: cleanSourceId,
                track_count: track_count || 0,
            })
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(created, { status: 201 });
    }

    // Local / Bubble playlist (no source_id): always a distinct new row.
    const { data: playlist, error } = await supabase
        .from('user_playlists')
        .insert({
            user_id: user.id,
            name: name.trim(),
            description: description || '',
            artwork_url: artwork_url || '',
            source: source || 'local',
            track_count: track_count || 0,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(playlist, { status: 201 });
}
