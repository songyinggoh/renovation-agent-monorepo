'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import toast from 'react-hot-toast';
import { fetchWithAuth } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';
import { Logger } from '@/lib/logger';

const logger = new Logger({ serviceName: 'CreateSessionButton' });

export function CreateSessionButton() {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleCreateSession = async () => {
        try {
            setIsLoading(true);
            const newSession = await fetchWithAuth('/api/sessions', {
                method: 'POST',
                body: JSON.stringify({
                    title: `Renovation Session ${new Date().toLocaleString()}`,
                    totalBudget: 50000,
                }),
            });
            router.push(`/app/session/${newSession.id as string}` as Route);
        } catch (error) {
            logger.error('Failed to create session', error as Error);
            toast.error('Failed to create session. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button onClick={handleCreateSession} disabled={isLoading} className="gap-2">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {isLoading ? 'Creating...' : 'New Session'}
        </Button>
    );
}
