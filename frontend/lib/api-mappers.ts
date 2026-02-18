import type { SessionDetail, RoomSummary } from '@/types/renovation';
import type { Message } from '@/types/chat';

/**
 * Maps API responses (camelCase from Drizzle ORM) to TypeScript interfaces.
 * Centralizes the backend→frontend data transformation layer.
 */

export function mapSessionResponse(data: Record<string, unknown>): SessionDetail {
  return {
    id: data.id as string,
    title: data.title as string,
    phase: data.phase as SessionDetail['phase'],
    totalBudget: data.totalBudget as string | null,
    currency: (data.currency as string | undefined) ?? 'USD',
    createdAt: data.createdAt as string,
    updatedAt: data.updatedAt as string,
    stylePreferences: (data.stylePreferences as SessionDetail['stylePreferences']) ?? null,
  };
}

export function mapRoomResponse(data: Record<string, unknown>): RoomSummary {
  return {
    id: data.id as string,
    name: data.name as string,
    type: data.type as string,
    budget: (data.budget as string | null) ?? null,
  };
}

export function mapRoomsResponse(data: Record<string, unknown>): RoomSummary[] {
  return ((data.rooms as Record<string, unknown>[] | undefined) ?? []).map(mapRoomResponse);
}

export function mapMessageResponse(data: Record<string, unknown>): Message {
  const rawImageUrl = (data.image_url ?? data.imageUrl) as string | null | undefined;
  const imageUrls = rawImageUrl
    ? rawImageUrl.split(',').filter(Boolean)
    : undefined;

  return {
    id: data.id as string,
    role: data.role as Message['role'],
    content: data.content as string,
    created_at: (data.created_at ?? data.createdAt) as string,
    session_id: (data.session_id ?? data.sessionId) as string,
    ...(imageUrls && imageUrls.length > 0 ? { imageUrls } : {}),
  };
}

export function mapMessagesResponse(data: Record<string, unknown>): Message[] {
  return ((data.messages as Record<string, unknown>[] | undefined) ?? []).map(mapMessageResponse);
}
