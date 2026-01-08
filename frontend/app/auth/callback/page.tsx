'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallback() {
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        const handleAuth = async () => {
            const { error } = await supabase.auth.exchangeCodeForSession(window.location.search);
            if (!error) {
                router.push('/app');
            } else {
                router.push('/');
            }
        };

        handleAuth();
    }, [supabase, router]);

    return <div className="p-8 text-center">Authenticating...</div>;
}
