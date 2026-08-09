import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export async function DELETE(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Initialize Supabase admin client with Service Role Key
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

        if (!serviceRoleKey) {
            return NextResponse.json({ error: 'Server misconfiguration: Service Role Key missing' }, { status: 500 });
        }

        const adminAuthClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        const { error: deleteError } = await adminAuthClient.auth.admin.deleteUser(user.id);

        if (deleteError) {
            console.error('Failed to delete user:', deleteError);
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('Exception during account deletion:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
