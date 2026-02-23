'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/api';

interface RenderAsset {
  id: string;
  roomId: string;
  status: 'processing' | 'ready' | 'failed';
  storagePath?: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
}

export function roomRendersQueryKey(roomId: string) {
  return ['room', roomId, 'renders'] as const;
}

export function useRoomRenders(roomId: string | null) {
  const { data: renders = [], isLoading, error } = useQuery<RenderAsset[]>({
    queryKey: roomRendersQueryKey(roomId!),
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/rooms/${roomId}/renders`);
      return res.renders ?? [];
    },
    enabled: !!roomId,
  });

  return { renders, isLoading, error: error?.message ?? null };
}
