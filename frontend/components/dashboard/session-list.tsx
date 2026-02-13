'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import toast from 'react-hot-toast';
import { fetchWithAuth } from '@/lib/api';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { PHASE_CONFIG, type RenovationPhase } from '@/lib/design-tokens';
import { SkeletonLoader } from '@/components/ui/skeleton-loader';
import { ClipboardList, ChevronRight } from 'lucide-react';
import { Logger } from '@/lib/logger';

const logger = new Logger({ serviceName: 'SessionList' });

interface Session {
    id: string;
    title: string;
    phase: string;
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
                logger.error('Failed to load sessions', error as Error);
                toast.error('Failed to load sessions. Please refresh the page.');
            } finally {
                setLoading(false);
            }
        };

        loadSessions();
    }, []);

    if (loading) {
        return (
            <div className="p-6">
                <SkeletonLoader variant="session-card" count={3} />
            </div>
        );
    }

    if (sessions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
                <div className="rounded-full bg-primary/10 p-4">
                    <ClipboardList className="h-10 w-10 text-primary" />
                </div>
                <div>
                    <p className="font-semibold text-foreground">
                        Your renovation journey starts here
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Create your first session to begin planning with AI.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <ul className="divide-y divide-border">
            {sessions.map((session) => (
                <li key={session.id}>
                    <Link
                        href={`/app/session/${session.id}` as Route}
                        className="flex items-center justify-between gap-x-6 rounded-lg px-4 py-5 transition-colors hover:bg-muted/50"
                    >
                        <div className="min-w-0 flex-auto">
                            <p className="text-sm font-semibold leading-6 text-foreground">
                                {session.title}
                            </p>
                            <p className="mt-1 truncate text-xs leading-5 text-muted-foreground">
                                Created: {new Date(session.createdAt).toLocaleDateString()}
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <Badge
                                variant={`phase-${session.phase.toLowerCase()}` as BadgeProps['variant']}
                                className="hidden sm:inline-flex"
                            >
                                {PHASE_CONFIG[session.phase as RenovationPhase]?.label ?? session.phase}
                            </Badge>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                    </Link>
                </li>
            ))}
        </ul>
    );
}
