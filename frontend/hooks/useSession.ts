'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import type { SessionDetail } from '@/types/renovation';

export function useSession(sessionId: string) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    if (!sessionId) return;

    try {
      setError(null);
      const data = await fetchWithAuth(`/api/sessions/${sessionId}`);

      // Map snake_case DB response to camelCase
      setSession({
        id: data.id,
        title: data.title,
        phase: data.phase,
        totalBudget: data.total_budget,
        currency: data.currency ?? 'USD',
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        stylePreferences: data.style_preferences ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch session';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return { session, isLoading, error, refetch: fetchSession };
}
