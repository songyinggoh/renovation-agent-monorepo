'use client';

import { DocumentCard } from './document-card';
import { cn } from '@/lib/utils';
import type { DocumentArtifact } from '@/hooks/useDocuments';

interface DocumentListProps {
  documents: DocumentArtifact[];
  className?: string;
}

export function DocumentList({ documents, className }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center', className)}>
        <p className="text-sm font-medium text-muted-foreground">No documents yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Your renovation plans and checklists will appear here after they are generated.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', className)}>
      {documents.map((doc) => (
        <DocumentCard key={doc.id} document={doc} />
      ))}
    </div>
  );
}
