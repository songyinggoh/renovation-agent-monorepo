'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithAuth } from '@/lib/api';

export function CreateSessionButton() {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleCreateSession = async () => {
        try {
            setIsLoading(true);
            await fetchWithAuth('/api/sessions', {
                method: 'POST',
                body: JSON.stringify({
                    title: `Renovation Session ${new Date().toLocaleString()}`,
                    totalBudget: 50000,
                }),
            });
            router.refresh();
        } catch (error) {
            console.error('Failed to create session:', error);
            alert('Failed to create session');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button
            onClick={handleCreateSession}
            disabled={isLoading}
            className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
        >
            {isLoading ? 'Creating...' : 'Create New Session'}
        </button>
    );
}
