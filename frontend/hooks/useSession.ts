'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { mapSessionResponse } from '@/lib/api-mappers';

export function sessionQueryKey(sessionId: string) {
  return ['session', sessionId] as const;
}

export function useSession(sessionId: string) {
  const queryClient = useQueryClient();

  const { data: session = null, isLoading, error } = useQuery({
    queryKey: sessionQueryKey(sessionId),
    queryFn: () => fetchWithAuth(`/api/sessions/${sessionId}`).then(mapSessionResponse),
    enabled: !!sessionId,
  });

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: sessionQueryKey(sessionId) });
  }, [queryClient, sessionId]);

  return {
    session,
    isLoading,
    error: error?.message ?? null,
    refetch,
  };
}
