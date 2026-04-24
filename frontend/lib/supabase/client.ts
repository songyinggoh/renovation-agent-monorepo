import { createBrowserClient } from '@supabase/ssr';

/** True when Supabase env vars are present. */
export const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * Create a Supabase browser client.
 * Returns `null` when Supabase is not configured (anonymous mode, Phases 1-7).
 */
export function createClient() {
    if (!isSupabaseConfigured) return null;

    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}
