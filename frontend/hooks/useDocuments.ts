'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/api';

export interface DocumentArtifact {
  id: string;
  documentType: 'checklist_pdf' | 'plan_pdf';
  filename: string;
  version: number;
  fileSize: number | null;
  createdAt: string;
  signedUrl: string | null;
}

export function documentsQueryKey(sessionId: string) {
  return ['sessions', sessionId, 'documents'] as const;
}

export function useDocuments(sessionId: string | null) {
  const { data: documents = [], isLoading, error } = useQuery<DocumentArtifact[]>({
    queryKey: documentsQueryKey(sessionId!),
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sessions/${sessionId}/documents`);
      return res.documents ?? [];
    },
    enabled: !!sessionId,
  });

  return { documents, isLoading, error: error?.message ?? null };
}
