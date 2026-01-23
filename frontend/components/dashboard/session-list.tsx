'use client';

import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';

interface Session {
    id: string;
    title: string;
    status: string;
    createdAt: string;
}

export function SessionList() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadSessions = async () => {
            try {
                const data = await fetchWithAuth('/api/sessions');
                setSessions(data.sessions || []);
            } catch (error) {
                console.error('Failed to load sessions:', error);
            } finally {
                setLoading(false);
            }
        };

        loadSessions();
    }, []);

    if (loading) {
        return <div className="text-gray-500">Loading sessions...</div>;
    }

    if (sessions.length === 0) {
        return <div className="text-gray-500">No sessions found. Create one to get started!</div>;
    }

    return (
        <ul className="divide-y divide-gray-100">
            {sessions.map((session) => (
                <li key={session.id} className="flex justify-between gap-x-6 py-5">
                    <div className="flex min-w-0 gap-x-4">
                        <div className="min-w-0 flex-auto">
                            <p className="text-sm font-semibold leading-6 text-gray-900">{session.title}</p>
                            <p className="mt-1 truncate text-xs leading-5 text-gray-500">
                                Created: {new Date(session.createdAt).toLocaleDateString()}
                            </p>
                        </div>
                    </div>
                    <div className="hidden shrink-0 sm:flex sm:flex-col sm:items-end">
                        <p className="text-sm leading-6 text-gray-900">{session.status}</p>
                    </div>
                </li>
            ))}
        </ul>
    );
}
