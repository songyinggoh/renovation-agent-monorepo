import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env, isAuthEnabled } from './env.js';

export const supabaseAdmin: SupabaseClient | null = isAuthEnabled()
    ? createClient(
        env.SUPABASE_URL!,
        env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        }
    )
    : null; // Will be null if auth is not enabled (development mode)
