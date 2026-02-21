'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/api';
import { sessionRoomsQueryKey } from '@/hooks/useSessionRooms';

interface RequestRenderParams {
  roomId: string;
  sessionId: string;
  prompt: string;
  baseAssetId?: string;
}

interface RequestRenderResult {
  assetId: string;
  jobId: string;
}

/**
 * TanStack Query mutation for requesting an AI render.
 * Uses optimistic UI — Socket.io events drive subsequent cache updates.
 */
export function useRequestRender() {
  const queryClient = useQueryClient();

  return useMutation<RequestRenderResult, Error, RequestRenderParams>({
    mutationFn: async ({ roomId, sessionId, prompt, baseAssetId }) => {
      return fetchWithAuth(`/api/rooms/${roomId}/renders`, {
        method: 'POST',
        body: JSON.stringify({ prompt, sessionId, baseAssetId }),
      });
    },
    onSuccess: (_data, variables) => {
      // Invalidate room assets so the new pending render appears
      queryClient.invalidateQueries({
        queryKey: sessionRoomsQueryKey(variables.sessionId),
      });
    },
  });
}
