import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

/**
 * GET /api/tracks — Unified track read for the signed-in web user.
 *
 * Single source of truth for "all tracks" on web. Reads the `user_all_tracks`
 * Postgres view (liked ∪ playlist tracks, deduped by track_id, liked row wins).
 *
 * Query params:
 *   source     — filter by source ('spotify' | 'youtube' | 'arcod' | ...)
 *   liked=1    — only liked tracks
 *   search     — ILIKE across title/artist/album
 *   sort       — added (default) | title | artist | duration | played (→added)
 *   limit      — page size (default 200)
 *   offset     — page offset (default 0)
 *   count=1    — include only { total, duration } aggregate (no rows)
 *
 * Returns: { tracks, total, duration } where each track has id = track_id and
 * is_liked as 1/0 (mirrors js/api.js liked.getAll mapping).
 */
export async function GET(request: Request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') || '';
    const likedOnly = searchParams.get('liked') === '1' || searchParams.get('liked') === 'true';
    const downloadedOnly = searchParams.get('downloaded') === '1' || searchParams.get('downloaded') === 'true';
    const search = (searchParams.get('search') || '').trim();
    const sort = searchParams.get('sort') || 'added';
    const countOnly = searchParams.get('count') === '1' || searchParams.get('count') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10) || 200, 1000);
    const offset = parseInt(searchParams.get('offset') || '0', 10) || 0;

    // 'downloaded' has no backing column on web (downloads are client-side/localStorage).
    if (downloadedOnly) {
        return NextResponse.json({ tracks: [], total: 0, duration: 0 });
    }

    // Base filtered query against the deduped view (RLS scopes to this user).
    const buildQuery = (select: string, opts: { head?: boolean } = {}) => {
        let q = supabase
            .from('user_all_tracks')
            .select(select, opts.head ? { count: 'exact', head: true } : { count: 'exact' })
            .eq('user_id', user.id);
        if (likedOnly) q = q.eq('is_liked', 1);
        if (source) q = q.eq('source', source);
        if (search) {
            const esc = search.replace(/[%_]/g, (m) => `\\${m}`);
            q = q.or(`title.ilike.%${esc}%,artist.ilike.%${esc}%,album.ilike.%${esc}%`);
        }
        return q;
    };

    // Aggregate total + duration over the full filtered set (not the page).
    // Pull just the durations so we can sum without a Postgres RPC.
    const { data: durRows, count: total, error: aggError } = await buildQuery('duration');
    if (aggError) {
        return NextResponse.json({ error: aggError.message }, { status: 500 });
    }
    const duration = (durRows || []).reduce((s: number, r: any) => s + (r.duration || 0), 0);

    if (countOnly) {
        return NextResponse.json({ tracks: [], total: total || 0, duration });
    }

    // Sort mapping. 'played' has no per-play tracking on web → fall back to recency.
    let orderCol = 'added_ts';
    let ascending = false;
    switch (sort) {
        case 'title': orderCol = 'title'; ascending = true; break;
        case 'artist': orderCol = 'artist'; ascending = true; break;
        case 'duration': orderCol = 'duration'; ascending = true; break;
        case 'played':
        case 'added':
        default: orderCol = 'added_ts'; ascending = false; break;
    }

    const { data: rows, error } = await buildQuery('*')
        .order(orderCol, { ascending, nullsFirst: false })
        .range(offset, offset + limit - 1);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const tracks = (rows || []).map((t: any) => ({
        id: t.track_id,
        track_id: t.track_id,
        title: t.title,
        artist: t.artist,
        album: t.album || '',
        duration: t.duration || 0,
        artwork_url: t.artwork_url || '',
        source: t.source || '',
        source_id: t.source_id || '',
        arcod_id: t.arcod_id || '',
        youtube_id: t.youtube_id || '',
        quality: t.quality || 'flac',
        is_liked: t.is_liked ? 1 : 0,
        is_downloaded: 0,
    }));

    return NextResponse.json({ tracks, total: total || 0, duration });
}
