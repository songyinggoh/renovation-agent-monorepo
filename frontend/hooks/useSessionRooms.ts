'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import type { RoomSummary } from '@/types/renovation';

export function useSessionRooms(sessionId: string) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    if (!sessionId) return;

    try {
      setError(null);
      const data = await fetchWithAuth(`/api/sessions/${sessionId}/rooms`);

      // Map snake_case DB response to camelCase
      const mapped: RoomSummary[] = (data.rooms ?? []).map(
        (r: Record<string, unknown>) => ({
          id: r.id as string,
          name: r.name as string,
          type: r.type as string,
          budget: (r.budget as string | null) ?? null,
        })
      );

      setRooms(mapped);

      // Auto-select first room if none selected
      if (!selectedRoomId && mapped.length > 0) {
        setSelectedRoomId(mapped[0].id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch rooms';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, selectedRoomId]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const selectRoom = useCallback((roomId: string) => {
    setSelectedRoomId(roomId);
  }, []);

  return { rooms, isLoading, error, selectedRoomId, selectRoom, refetch: fetchRooms };
}
