'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { mapRoomsResponse } from '@/lib/api-mappers';
import type { RoomSummary } from '@/types/renovation';

export function sessionRoomsQueryKey(sessionId: string) {
  return ['session', sessionId, 'rooms'] as const;
}

export function useSessionRooms(sessionId: string) {
  const queryClient = useQueryClient();
  const [userSelection, setUserSelection] = useState<string | null>(null);

  const { data: rooms = [] as RoomSummary[], isLoading, error } = useQuery({
    queryKey: sessionRoomsQueryKey(sessionId),
    queryFn: () => fetchWithAuth(`/api/sessions/${sessionId}/rooms`).then(mapRoomsResponse),
    enabled: !!sessionId,
  });

  // Use explicit user selection if it still exists in the room list, otherwise default to first
  const selectedRoomId = userSelection && rooms.some((r) => r.id === userSelection)
    ? userSelection
    : rooms[0]?.id ?? null;

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: sessionRoomsQueryKey(sessionId) });
  }, [queryClient, sessionId]);

  return {
    rooms,
    isLoading,
    error: error?.message ?? null,
    selectedRoomId,
    selectRoom: setUserSelection,
    refetch,
  };
}
