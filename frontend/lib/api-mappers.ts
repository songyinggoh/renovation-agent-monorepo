import type { SessionDetail, RoomSummary } from '@/types/renovation';
import type { Message } from '@/types/chat';

/**
 * Maps snake_case API responses to camelCase TypeScript interfaces.
 * Centralizes the backend→frontend data transformation layer.
 */

export function mapSessionResponse(data: Record<string, unknown>): SessionDetail {
  return {
    id: data.id as string,
    title: data.title as string,
    phase: data.phase as SessionDetail['phase'],
    totalBudget: data.total_budget as string | null,
    currency: (data.currency as string | undefined) ?? 'USD',
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
    stylePreferences: (data.style_preferences as SessionDetail['stylePreferences']) ?? null,
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
  return {
    id: data.id as string,
    role: data.role as Message['role'],
    content: data.content as string,
    created_at: data.created_at as string,
    session_id: data.session_id as string,
  };
}

export function mapMessagesResponse(data: Record<string, unknown>): Message[] {
  return ((data.messages as Record<string, unknown>[] | undefined) ?? []).map(mapMessageResponse);
}
