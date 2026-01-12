import { createClient } from '@supabase/supabase-js';
import { env, isAuthEnabled } from './env.js';

export const supabaseAdmin = isAuthEnabled()
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
    : null as any; // Cast to any to avoid type issues where it's used, but it will fail at runtime if accessed
