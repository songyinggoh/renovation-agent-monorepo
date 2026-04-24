'use client';

import { RenderCard } from '@/components/renovation/render-card';
import type { RenderEntry } from '@/hooks/useRenderState';
import { notFound } from 'next/navigation';

/**
 * Visual test page for RenderCard in all 7 display states.
 * No backend connection — pure static mock data.
 *
 * Usage: http://localhost:3001/render-test
 */

// SVG data URI placeholder (gray 400x300 with "Render" text)
const PLACEHOLDER_IMAGE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">' +
      '<rect fill="#e2e2e2" width="400" height="300"/>' +
      '<text fill="#888" font-family="sans-serif" font-size="24" x="50%" y="50%" dominant-baseline="middle" text-anchor="middle">Render Preview</text>' +
      '</svg>',
  );

// ─── Mock data ──────────────────────────────────────────────────────

const processingBase = {
  roomId: 'room-001',
  status: 'processing' as const,
  metadata: { prompt: 'Modern kitchen with marble countertops and pendant lighting' },
};

const readyBase = {
  roomId: 'room-001',
  status: 'ready' as const,
  storagePath: PLACEHOLDER_IMAGE,
  contentType: 'image/png',
  metadata: { prompt: 'Scandinavian living room with light oak flooring and minimalist furniture' },
};

const failedBase = {
  roomId: 'room-001',
  status: 'failed' as const,
  metadata: { prompt: 'A room renovation render that failed to generate' },
};

interface MockCard {
  label: string;
  description: string;
  render: {
    id: string;
    roomId: string;
    status: 'processing' | 'ready' | 'failed';
    storagePath?: string;
    contentType?: string;
    metadata?: Record<string, unknown>;
  };
  activeRender?: RenderEntry;
}

const cards: MockCard[] = [
  {
    label: 'Processing (0%)',
    description: 'Queued — shimmer + "Queued..." label + empty progress bar',
    render: { id: 'render-proc-0', ...processingBase },
    activeRender: { assetId: 'render-proc-0', roomId: 'room-001', status: 'started', progress: 0, stage: 'queued' },
  },
  {
    label: 'Processing (65%)',
    description: 'Generating — shimmer + "Generating image..." + 65% progress bar',
    render: { id: 'render-proc-65', ...processingBase },
    activeRender: { assetId: 'render-proc-65', roomId: 'room-001', status: 'started', progress: 65, stage: 'generating' },
  },
  {
    label: 'Processing (95%)',
    description: 'Uploading — shimmer + "Uploading..." + 95% progress bar',
    render: { id: 'render-proc-95', ...processingBase },
    activeRender: { assetId: 'render-proc-95', roomId: 'room-001', status: 'started', progress: 95, stage: 'uploading' },
  },
  {
    label: 'Ready (pending)',
    description: 'Placeholder image + "Ready" badge + Compare/Approve/Reject buttons',
    render: { id: 'render-ready-pending', ...readyBase, metadata: { ...readyBase.metadata } },
  },
  {
    label: 'Ready (approved)',
    description: 'Green "Approved" badge, no Approve button',
    render: { id: 'render-ready-approved', ...readyBase, metadata: { ...readyBase.metadata, approvalStatus: 'approved' } },
  },
  {
    label: 'Ready (rejected)',
    description: 'Red "Rejected" badge, no Reject button',
    render: { id: 'render-ready-rejected', ...readyBase, metadata: { ...readyBase.metadata, approvalStatus: 'rejected' } },
  },
  {
    label: 'Failed',
    description: '"Generation failed" text + red "Failed" badge',
    render: { id: 'render-failed', ...failedBase },
  },
];

// ─── Page Component ─────────────────────────────────────────────────

export default function RenderTestPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <div className="mx-auto max-w-6xl p-8">
      <h1 className="text-fluid-2xl font-bold mb-2">RenderCard Visual Test</h1>
      <p className="text-muted-foreground mb-8">
        All 7 display states using mock data. No backend connection required.
      </p>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div key={card.render.id} className="space-y-2">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold">{card.label}</h2>
              <p className="text-xs text-muted-foreground">{card.description}</p>
            </div>
            <RenderCard
              render={card.render}
              activeRender={card.activeRender}
              onCompare={() => console.log(`[${card.label}] Compare clicked`)}
              onApprove={() => console.log(`[${card.label}] Approve clicked`)}
              onReject={() => console.log(`[${card.label}] Reject clicked`)}
            />
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        <h3 className="font-semibold mb-2">Verification Checklist</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>Processing cards show shimmer animation and stage labels</li>
          <li>Progress bars fill to the correct percentage</li>
          <li>Ready (pending) shows Compare, Approve, and Reject buttons</li>
          <li>Ready (approved) shows green Approved badge, no Approve button</li>
          <li>Ready (rejected) shows red Rejected badge, no Reject button</li>
          <li>Failed card shows &ldquo;Generation failed&rdquo; text and red Failed badge</li>
          <li>All cards have correct status badge overlay (top-left)</li>
        </ul>
      </div>
    </div>
  );
}
