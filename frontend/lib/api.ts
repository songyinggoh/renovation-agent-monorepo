import { createClient } from '@/lib/supabase/client';

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
        throw new Error('Not authenticated');
    }

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Content-Type', 'application/json');

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const fullUrl = url.startsWith('http') ? url : `${apiUrl}${url}`;

    const response = await fetch(fullUrl, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Request failed: ${response.status} ${errorBody}`);
    }

    return response.json();
}
