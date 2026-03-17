'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/api';
import { roomRendersQueryKey } from './useRoomRenders';

interface RequestRenderParams {
  sessionId: string;
  roomId: string;
  prompt: string;
  baseAssetId?: string;
}

interface RequestRenderResponse {
  assetId: string;
  jobId: string;
  status: string;
}

/**
 * Mutation hook to request a new AI render for a room.
 * Uses optimistic UI to show the 'processing' state immediately.
 */
export function useRequestRender() {
  const queryClient = useQueryClient();

  return useMutation<RequestRenderResponse, Error, RequestRenderParams>({
    mutationFn: async ({ sessionId, roomId, prompt, baseAssetId }) => {
      return fetchWithAuth(`/api/sessions/${sessionId}/rooms/${roomId}/renders`, {
        method: 'POST',
        body: JSON.stringify({ prompt, baseAssetId }),
      });
    },
    onMutate: async ({ roomId }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: roomRendersQueryKey(roomId) });

      // Snapshot the previous value
      const previousRenders = queryClient.getQueryData(roomRendersQueryKey(roomId));

      // Optimistically update to the new value
      // Note: We don't have the assetId yet, so we use a temporary one
      queryClient.setQueryData(roomRendersQueryKey(roomId), (old: unknown[] = []) => [
        {
          id: 'temp-' + Date.now(),
          roomId,
          status: 'processing',
          metadata: { prompt: 'Generating render...' },
        },
        ...old,
      ]);

      return { previousRenders, roomId };
    },
    onError: (err, variables, context) => {
      // Roll back to the previous value
      if (context?.roomId) {
        queryClient.setQueryData(
          roomRendersQueryKey(context.roomId),
          context.previousRenders
        );
      }
    },
    onSettled: (data, error, variables) => {
      // Always refetch after error or success to ensure synchronization
      queryClient.invalidateQueries({ queryKey: roomRendersQueryKey(variables.roomId) });
    },
  });
}
