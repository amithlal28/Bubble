import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

// Columns that are safe to hydrate into the browser. spotify_client_secret is
// deliberately excluded — it never leaves the server (see 4d in the plan).
const CLIENT_SAFE_COLUMNS = [
    'spotify_access_token',
    'spotify_refresh_token',
    'spotify_token_expiry',
    'spotify_client_id',
    'spotify_cookie',
    'arcod_token',
    'arcod_refresh_token',
    'arcod_token_expiry',
    'arcod_stashkey',
    'youtube_token',
    'updated_at',
];

export async function GET(request: Request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: integration, error } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "Row not found"
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!integration) return NextResponse.json({});

    // Strip secrets; expose only a boolean flag so the client can still tell
    // whether Spotify OAuth is fully configured without seeing the secret.
    const safe: any = {};
    for (const col of CLIENT_SAFE_COLUMNS) {
        if (integration[col] !== undefined) safe[col] = integration[col];
    }
    safe.has_spotify_client_secret = !!integration.spotify_client_secret;

    return NextResponse.json(safe);
}

// Fields a client is allowed to write. null is a valid value (used to
// disconnect a single field); undefined means "leave unchanged".
const WRITABLE_FIELDS = [
    'spotify_access_token',
    'spotify_refresh_token',
    'spotify_token_expiry',
    'spotify_client_id',
    'spotify_client_secret',
    'spotify_cookie',
    'arcod_token',
    'arcod_refresh_token',
    'arcod_token_expiry',
    'arcod_stashkey',
    'youtube_token',
];

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    const updateData: any = { user_id: user.id, updated_at: new Date().toISOString() };

    // Only touch fields that are present in the body. Passing null explicitly
    // clears that field (single-field disconnect); omitting it leaves it as-is.
    for (const field of WRITABLE_FIELDS) {
        if (body[field] !== undefined) updateData[field] = body[field];
    }

    const { error } = await supabase
        .from('user_integrations')
        .upsert(updateData, { onConflict: 'user_id' });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}

// Disconnect a whole service across all devices by nulling its columns.
// DELETE /api/integrations?service=arcod|spotify|youtube  (omit service = all)
const SERVICE_COLUMNS: Record<string, string[]> = {
    arcod: ['arcod_token', 'arcod_refresh_token', 'arcod_token_expiry', 'arcod_stashkey'],
    spotify: ['spotify_access_token', 'spotify_refresh_token', 'spotify_token_expiry', 'spotify_client_id', 'spotify_client_secret', 'spotify_cookie'],
    youtube: ['youtube_token'],
};

export async function DELETE(request: Request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = new URL(request.url).searchParams.get('service') || '';
    const cols = SERVICE_COLUMNS[service] || Object.values(SERVICE_COLUMNS).flat();

    const updateData: any = { user_id: user.id, updated_at: new Date().toISOString() };
    for (const col of cols) updateData[col] = null;

    const { error } = await supabase
        .from('user_integrations')
        .upsert(updateData, { onConflict: 'user_id' });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
