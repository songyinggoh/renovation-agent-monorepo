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

    const handleCreateSession = async () => {
        const title = prompt('Enter renovation title:', 'Kitchen Remodel');
        if (!title) return;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'}/api/sessions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    title,
                    totalBudget: 5000 // Dummy default budget
                })
            });

            if (response.ok) {
                const newSession = await response.json();
                setSessions(prev => [newSession, ...prev]);
            }
        } catch (err) {
            console.error('Failed to create session', err);
            alert('Failed to create session. Check console for details.');
        }
    };

    if (loading) {
        return <div className="p-8 text-center">Loading...</div>;
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <header className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Your Renovation Sessions</h1>
                    <div className="mt-1 text-sm text-muted-foreground">
                        Logged in as: {user?.email}
                    </div>
                </div>
                <button
                    onClick={handleCreateSession}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                    + New Session
                </button>
            </header>

            {sessions.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed p-12 text-center">
                    <p className="text-muted-foreground">No sessions found. Start a new one!</p>
                    <button
                        onClick={handleCreateSession}
                        className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
                    >
                        Create Your First Session
                    </button>
                </div>
            ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {sessions.map((session) => (
                        <div key={session.id} className="group relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md">
                            <div className="flex flex-col h-full">
                                <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">{session.title}</h3>
                                <div className="mt-auto">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                                            {session.phase}
                                        </span>
                                        <span className="text-sm font-semibold">
                                            ${Number(session.totalBudget).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="text-xs text-muted-foreground pt-4 border-t">
                                        Created {new Date(session.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
