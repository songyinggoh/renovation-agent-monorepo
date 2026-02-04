'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
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
                <li key={session.id}>
                    <Link
                        href={`/app/session/${session.id}` as Route}
                        className="flex justify-between gap-x-6 py-5 rounded-lg px-3 transition-colors hover:bg-gray-100"
                    >
                        <div className="flex min-w-0 gap-x-4">
                            <div className="min-w-0 flex-auto">
                                <p className="text-sm font-semibold leading-6 text-gray-900">{session.title}</p>
                                <p className="mt-1 truncate text-xs leading-5 text-gray-500">
                                    Created: {new Date(session.createdAt).toLocaleDateString()}
                                </p>
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <span className="hidden text-sm leading-6 text-gray-900 sm:block">{session.status}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-gray-400">
                                <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                            </svg>
                        </div>
                    </Link>
                </li>
            ))}
        </ul>
    );
}
