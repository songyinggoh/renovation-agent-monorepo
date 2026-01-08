'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function DashboardPage() {
    const [sessions, setSessions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        const checkUser = async () => {
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error || !session) {
                router.push('/');
                return;
            }

            setUser(session.user);
            fetchSessions(session.access_token);
        };

        const fetchSessions = async (token: string) => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'}/api/sessions`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    setSessions(data.sessions || []);
                }
            } catch (err) {
                console.error('Failed to fetch sessions', err);
            } finally {
                setLoading(false);
            }
        };

        checkUser();
    }, [supabase, router]);

    if (loading) {
        return <div className="p-8 text-center">Loading...</div>;
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <header className="mb-8 flex items-center justify-between">
                <h1 className="text-3xl font-bold">Your Renovation Sessions</h1>
                <div className="text-right text-sm text-muted-foreground">
                    Logged in as: {user?.email}
                </div>
            </header>

            {sessions.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed p-12 text-center">
                    <p className="text-muted-foreground">No sessions found. Start a new one!</p>
                    <button className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground">
                        Create Session
                    </button>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {sessions.map((session) => (
                        <div key={session.id} className="rounded-lg border bg-card p-6 shadow-sm">
                            <h3 className="text-xl font-semibold">{session.title}</h3>
                            <p className="text-sm text-muted-foreground">Phase: {session.phase}</p>
                            <p className="mt-2 font-medium">Budget: ${session.totalBudget}</p>
                            <div className="mt-4 text-xs text-muted-foreground">
                                Created on {new Date(session.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
