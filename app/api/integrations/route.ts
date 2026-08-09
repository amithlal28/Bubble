import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

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

    return NextResponse.json(integration || {});
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const updateData: any = { user_id: user.id, updated_at: new Date().toISOString() };
    
    // Only update fields that are provided
    if (body.spotify_access_token !== undefined) updateData.spotify_access_token = body.spotify_access_token;
    if (body.spotify_refresh_token !== undefined) updateData.spotify_refresh_token = body.spotify_refresh_token;
    if (body.spotify_token_expiry !== undefined) updateData.spotify_token_expiry = body.spotify_token_expiry;
    if (body.spotify_client_id !== undefined) updateData.spotify_client_id = body.spotify_client_id;
    if (body.spotify_client_secret !== undefined) updateData.spotify_client_secret = body.spotify_client_secret;
    if (body.spotify_cookie !== undefined) updateData.spotify_cookie = body.spotify_cookie;
    if (body.arcod_token !== undefined) updateData.arcod_token = body.arcod_token;
    if (body.youtube_token !== undefined) updateData.youtube_token = body.youtube_token;

    const { error } = await supabase
        .from('user_integrations')
        .upsert(updateData, { onConflict: 'user_id' });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
