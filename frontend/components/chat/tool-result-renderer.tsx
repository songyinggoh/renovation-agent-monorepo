'use client';

import { Message } from '@/types/chat';

interface ToolResultRendererProps {
  message: Message;
}

/** Human-readable labels for tool names */
const TOOL_LABELS: Record<string, string> = {
  get_style_examples: 'Style Details',
  search_products: 'Product Results',
  save_intake_state: 'Intake Saved',
  save_checklist_state: 'Checklist Saved',
  save_product_recommendation: 'Product Saved',
  generate_render: 'Render Requested',
};

interface ColorSwatch {
  name: string;
  hex: string;
}

interface Product {
  name: string;
  category: string;
  description?: string;
  price: string;
  brand?: string;
  material?: string | null;
  compatibleStyles?: string[];
}

/**
 * Renders tool results as styled cards in the chat UI
 * Each tool type gets a specialized visual treatment
 */
export function ToolResultRenderer({ message }: ToolResultRendererProps) {
  const toolName = message.tool_name ?? 'unknown';
  const data = message.tool_data ?? {};
  const label = TOOL_LABELS[toolName] ?? toolName;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border/50 bg-card p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <ToolIcon toolName={toolName} />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </div>
        <ToolContent toolName={toolName} data={data} />
      </div>
    </div>
  );
}

function ToolIcon({ toolName }: { toolName: string }) {
  const iconMap: Record<string, string> = {
    get_style_examples: '\u{1F3A8}',
    search_products: '\u{1F50D}',
    save_intake_state: '\u{2705}',
    save_checklist_state: '\u{1F4CB}',
    save_product_recommendation: '\u{1F4E6}',
    generate_render: '\u{1F5BC}',
  };
  return <span className="text-base">{iconMap[toolName] ?? '\u{1F527}'}</span>;
}

function ToolContent({ toolName, data }: { toolName: string; data: Record<string, unknown> }) {
  switch (toolName) {
    case 'get_style_examples':
      return <StyleResult data={data} />;
    case 'search_products':
      return <ProductResult data={data} />;
    case 'save_intake_state':
      return <IntakeSavedResult data={data} />;
    case 'save_checklist_state':
      return <ChecklistSavedResult data={data} />;
    case 'save_product_recommendation':
      return <ProductSavedResult data={data} />;
    case 'generate_render':
      return <RenderRequestedResult data={data} />;
    default:
      return (
        <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
          {JSON.stringify(data, null, 2)}
        </pre>
      );
  }
}

function StyleResult({ data }: { data: Record<string, unknown> }) {
  const name = typeof data.name === 'string' ? data.name : undefined;
  const description = typeof data.description === 'string' ? data.description : undefined;
  const colorPalette = Array.isArray(data.colorPalette) ? data.colorPalette as ColorSwatch[] : undefined;
  const materials = Array.isArray(data.materials) ? data.materials as string[] : undefined;

  if (data.error) {
    const errorMsg = typeof data.error === 'string' ? data.error : 'Unknown error';
    return <p className="text-sm text-muted-foreground">{errorMsg}</p>;
  }

  return (
    <div className="space-y-2">
      {name && <h4 className="font-serif text-base font-semibold">{name}</h4>}
      {description && (
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {colorPalette && colorPalette.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {colorPalette.map((color) => (
            <div
              key={color.hex}
              className="flex items-center gap-1.5 rounded-full border border-border/50 px-2 py-0.5"
            >
              <span
                className="inline-block h-3 w-3 rounded-full border border-border/30"
                style={{ backgroundColor: color.hex }}
              />
              <span className="text-xs">{color.name}</span>
            </div>
          ))}
        </div>
      )}
      {materials && materials.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {materials.map((m) => (
            <span key={m} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductResult({ data }: { data: Record<string, unknown> }) {
  const products = Array.isArray(data.products) ? data.products as Product[] : undefined;
  const totalMatches = typeof data.totalMatches === 'number' ? data.totalMatches : undefined;

  if (data.message) {
    const msg = typeof data.message === 'string' ? data.message : 'Unknown message';
    return <p className="text-sm text-muted-foreground">{msg}</p>;
  }

  if (!products || products.length === 0) {
    return <p className="text-sm text-muted-foreground">No products found.</p>;
  }

  return (
    <div className="space-y-2">
      {products.map((product) => (
        <div key={product.name} className="rounded-lg border border-border/30 p-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium">{product.name}</p>
              <p className="text-xs text-muted-foreground">{product.category}</p>
            </div>
            <span className="currency text-sm font-semibold text-primary">
              {product.price}
            </span>
          </div>
          {product.description && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">
              {product.description}
            </p>
          )}
        </div>
      ))}
      {totalMatches && totalMatches > products.length && (
        <p className="text-xs text-muted-foreground">
          Showing {products.length} of {totalMatches} matches
        </p>
      )}
    </div>
  );
}

function IntakeSavedResult({ data }: { data: Record<string, unknown> }) {
  const message = typeof data.message === 'string' ? data.message : undefined;
  const rooms = Array.isArray(data.rooms) ? data.rooms as Array<{ id: string; name: string; type: string; budget?: string }> : undefined;

  return (
    <div className="space-y-2">
      {message && <p className="text-sm font-medium text-green-700 dark:text-green-400">{message}</p>}
      {rooms && rooms.length > 0 && (
        <div className="space-y-1">
          {rooms.map((room) => (
            <div key={room.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5">{room.type}</span>
              <span>{room.name}</span>
              {room.budget && <span className="currency ml-auto">${room.budget}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductSavedResult({ data }: { data: Record<string, unknown> }) {
  const success = typeof data.success === 'boolean' ? data.success : undefined;
  const message = typeof data.message === 'string' ? data.message : undefined;
  const roomName = typeof data.roomName === 'string' ? data.roomName : undefined;
  const error = typeof data.error === 'string' ? data.error : undefined;

  if (success === false || error) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive/10 text-xs text-destructive">
          !
        </span>
        <p className="text-sm text-destructive">{error ?? 'Failed to save product'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-xs dark:bg-green-900/30">
          <svg
            className="h-3 w-3 text-green-700 dark:text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <p className="text-sm font-medium text-green-700 dark:text-green-400">
          {message ?? 'Product saved'}
        </p>
      </div>
      {roomName && (
        <p className="text-xs text-muted-foreground">
          Added to <span className="font-medium">{roomName}</span>
        </p>
      )}
    </div>
  );
}

function RenderRequestedResult({ data }: { data: Record<string, unknown> }) {
  const success = typeof data.success === 'boolean' ? data.success : undefined;
  const error = typeof data.error === 'string' ? data.error : undefined;
  const jobId = typeof data.jobId === 'string' ? data.jobId : undefined;

  if (success === false || error) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive/10 text-xs text-destructive">
          !
        </span>
        <p className="text-sm text-destructive">{error ?? 'Failed to generate render'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--phase-render))]" />
        <p className="text-sm font-medium">Render generation started</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Your AI render is being generated. It will appear shortly.
      </p>
      {jobId && (
        <p className="text-[10px] font-mono text-muted-foreground/60">
          Job: {jobId}
        </p>
      )}
    </div>
  );
}

function ChecklistSavedResult({ data }: { data: Record<string, unknown> }) {
  const message = typeof data.message === 'string' ? data.message : undefined;
  const priorities = (typeof data.priorities === 'object' && data.priorities !== null && !Array.isArray(data.priorities))
    ? data.priorities as { mustHave?: number; niceToHave?: number; optional?: number }
    : undefined;

  return (
    <div className="space-y-2">
      {message && <p className="text-sm font-medium text-green-700 dark:text-green-400">{message}</p>}
      {priorities && (
        <div className="flex gap-3 text-xs text-muted-foreground">
          {priorities.mustHave !== undefined && (
            <span>Must-have: <strong>{priorities.mustHave}</strong></span>
          )}
          {priorities.niceToHave !== undefined && (
            <span>Nice-to-have: <strong>{priorities.niceToHave}</strong></span>
          )}
          {priorities.optional !== undefined && (
            <span>Optional: <strong>{priorities.optional}</strong></span>
          )}
        </div>
      )}
    </div>
  );
}
