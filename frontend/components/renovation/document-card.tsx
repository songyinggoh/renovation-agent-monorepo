'use client';

import { FileText, Download, Calendar, HardDrive } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DocumentArtifact } from '@/hooks/useDocuments';

interface DocumentCardProps {
  document: DocumentArtifact;
  className?: string;
}

const TYPE_LABELS: Record<string, string> = {
  checklist_pdf: 'Checklist',
  plan_pdf: 'Renovation Plan',
};

const PHASE_COLORS: Record<string, string> = {
  checklist_pdf: 'var(--phase-checklist)',
  plan_pdf: 'var(--phase-plan)',
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateStr));
}

export function DocumentCard({ document, className }: DocumentCardProps) {
  const label = TYPE_LABELS[document.documentType] ?? 'Document';
  const color = PHASE_COLORS[document.documentType] ?? 'var(--muted)';

  return (
    <div
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md',
        'ring-1 ring-transparent hover:ring-[color:var(--ring-color)]',
        className
      )}
      style={{ '--ring-color': color } as React.CSSProperties}
    >
      <div className="flex items-start gap-3">
        <div 
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `color-mix(in srgb, ${color}, transparent 85%)`, color }}
        >
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-medium leading-tight text-foreground">
              {document.filename}
            </h4>
            <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px] font-normal">
              v{document.version}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(document.createdAt)}</span>
          </div>
          <div className="flex items-center gap-1">
            <HardDrive className="h-3 w-3" />
            <span>{formatFileSize(document.fileSize)}</span>
          </div>
        </div>

        {document.signedUrl ? (
          <a
            href={document.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/5 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            title="Download PDF"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground opacity-50 cursor-not-allowed">
            <Download className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
    </div>
  );
}
