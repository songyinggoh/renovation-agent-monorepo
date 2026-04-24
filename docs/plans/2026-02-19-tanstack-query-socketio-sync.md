# TanStack Query + Socket.io Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate race conditions between Socket.io events and REST API readiness, recover from missed events during reconnection windows, and provide optimistic UI for async generation operations.

**Architecture:** Wire the existing `useSocketQuerySync` hook into the component tree by lifting `useChat` from `ChatView` to `SessionPageClient`, removing the legacy `window.CustomEvent` bridge. Add two new hooks for real-time progress tracking of image optimization and render generation. Add missing render event types to shared-types.

**Tech Stack:** React 19, TanStack Query v5, Socket.io client, Vitest + @testing-library/react

---

## Task 1: Add Render Event Types to Shared Types

**Files:**
- Modify: `packages/shared-types/src/socket-events.ts`
- Modify: `packages/shared-types/src/index.ts`

**Step 1: Add render event payload interfaces**

In `packages/shared-types/src/socket-events.ts`, add after the `AssetProcessingProgressPayload` interface (line 69):

```typescript
export interface RenderStartedPayload {
  assetId: string;
  roomId: string;
  sessionId: string;
}

export interface RenderCompletePayload {
  assetId: string;
  roomId: string;
  contentType: string;
  sizeBytes: number;
  model: string;
}

export interface RenderFailedPayload {
  assetId: string;
  roomId: string;
  error: string;
}
```

**Step 2: Add render events to ServerToClientEvents**

In the `ServerToClientEvents` interface, add:

```typescript
'render:started': (data: RenderStartedPayload) => void;
'render:complete': (data: RenderCompletePayload) => void;
'render:failed': (data: RenderFailedPayload) => void;
```

**Step 3: Export new types from barrel**

In `packages/shared-types/src/index.ts`, add to the socket-events re-export block:

```typescript
type RenderStartedPayload,
type RenderCompletePayload,
type RenderFailedPayload,
```

**Step 4: Verify compilation**

Run: `cd packages/shared-types && npx tsc --noEmit`
Expected: 0 errors

**Step 5: Commit**

```
feat(shared-types): add render event payload types to ServerToClientEvents
```

---

## Task 2: Remove CustomEvent Bridge from useChat + Expose socketRef

**Files:**
- Modify: `frontend/hooks/useChat.ts`
- Modify: `frontend/__tests__/hooks/useChat.test.ts`

**Step 1: Fix 2 pre-existing test failures**

In `frontend/__tests__/hooks/useChat.test.ts`:

Fix line 143 — change:
```typescript
expect(mockSocket.emit).toHaveBeenCalledWith('chat:join_session', 'session-123');
```
to:
```typescript
expect(mockSocket.emit).toHaveBeenCalledWith('chat:join_session', { sessionId: 'session-123' });
```

Fix the "should set error when no token found" test (lines 107-118) — anonymous auth is now allowed, so change:
```typescript
it('should set error when no token found', async () => {
```
to:
```typescript
it('should connect anonymously when no token found', async () => {
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: null },
    error: null,
  });

  const { io } = await import('socket.io-client');

  renderHook(() => useChat('session-123'));

  await waitFor(() => {
    expect(io).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        auth: {},
      })
    );
  });
});
```

**Step 2: Run tests to verify fixes**

Run: `cd frontend && npx vitest run __tests__/hooks/useChat.test.ts`
Expected: 19 tests pass (0 fail)

**Step 3: Write test for socketRef exposure**

Add to useChat.test.ts in the "Initialization" describe block:

```typescript
it('should expose socketRef', async () => {
  const { result } = renderHook(() => useChat('session-123'));

  await waitFor(() => {
    expect(result.current.socketRef).toBeDefined();
    expect(result.current.socketRef.current).toBeDefined();
  });
});
```

**Step 4: Run test to verify it fails**

Run: `cd frontend && npx vitest run __tests__/hooks/useChat.test.ts -- -t "should expose socketRef"`
Expected: FAIL — `socketRef` not in return type

**Step 5: Write test verifying CustomEvent bridge is removed**

Add to useChat.test.ts in a new "Session Event Bridge Removal" describe block:

```typescript
describe('Session Event Bridge Removal', () => {
  it('should NOT dispatch window CustomEvents for rooms_updated', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderHook(() => useChat('session-123'));

    await waitFor(() => {
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    // session:rooms_updated and session:phase_changed listeners should NOT be registered
    const registeredEvents = mockSocket.on.mock.calls.map((call: [string, unknown]) => call[0]);
    expect(registeredEvents).not.toContain('session:rooms_updated');
    expect(registeredEvents).not.toContain('session:phase_changed');

    dispatchSpy.mockRestore();
  });
});
```

**Step 6: Run test to verify it fails**

Run: `cd frontend && npx vitest run __tests__/hooks/useChat.test.ts -- -t "should NOT dispatch"`
Expected: FAIL — listeners ARE registered

**Step 7: Modify useChat.ts**

1. Remove the `session:rooms_updated` listener block (lines 181-187)
2. Remove the `session:phase_changed` listener block (lines 189-195)
3. Add `socketRef` to the return object:

Change the return block (line 241) from:
```typescript
return {
  messages,
  sendMessage,
  isConnected,
  error,
  isAssistantTyping,
  isLoadingHistory,
};
```
to:
```typescript
return {
  messages,
  sendMessage,
  isConnected,
  error,
  isAssistantTyping,
  isLoadingHistory,
  socketRef,
};
```

**Step 8: Run all useChat tests**

Run: `cd frontend && npx vitest run __tests__/hooks/useChat.test.ts`
Expected: All pass (including new tests)

**Step 9: Commit**

```
refactor(useChat): expose socketRef, remove legacy CustomEvent bridge

The session:rooms_updated and session:phase_changed events are now
handled by useSocketQuerySync which invalidates TanStack Query
caches directly, replacing the fragile window.CustomEvent bridge.
```

---

## Task 3: Convert ChatView to Presentational Component

**Files:**
- Modify: `frontend/components/chat/chat-view.tsx`

**Step 1: Change ChatView props interface**

Replace the interface and hook usage. ChatView should accept all chat state as props instead of calling `useChat` internally:

```typescript
interface ChatViewProps {
  sessionId: string;
  phase?: RenovationPhase;
  roomId?: string;
  // Chat state (lifted from useChat)
  messages: Message[];
  sendMessage: (content: string, attachments?: { assetId: string; fileName?: string }[]) => void;
  isConnected: boolean;
  error: string | null;
  isAssistantTyping: boolean;
  isLoadingHistory: boolean;
}
```

Remove the `useChat(sessionId)` call. Destructure from props instead:

```typescript
export function ChatView({
  sessionId,
  phase,
  roomId,
  messages,
  sendMessage,
  isConnected,
  error,
  isAssistantTyping,
  isLoadingHistory,
}: ChatViewProps) {
  const router = useRouter();
  // Remove: const { messages, sendMessage, isConnected, error, isAssistantTyping, isLoadingHistory } = useChat(sessionId);
```

Remove the `useChat` import.
Add `import { Message } from '@/types/chat';`

**Step 2: Verify type-check**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: Type errors in `session-page-client.tsx` (missing props) — this is expected, will be fixed in Task 4.

**Step 3: Commit (WIP — will fix type errors in Task 4)**

Do NOT commit yet — wait until Task 4 completes the circuit.

---

## Task 4: Lift useChat to SessionPageClient + Wire useSocketQuerySync

**Files:**
- Modify: `frontend/components/session/session-page-client.tsx`

**Step 1: Rewrite session-page-client.tsx**

```typescript
'use client';

import { useSession } from '@/hooks/useSession';
import { useSessionRooms } from '@/hooks/useSessionRooms';
import { useChat } from '@/hooks/useChat';
import { useSocketQuerySync } from '@/hooks/useSocketQuerySync';
import { ChatView } from '@/components/chat/chat-view';
import { SessionSidebar } from '@/components/session/session-sidebar';

interface SessionPageClientProps {
  sessionId: string;
}

export function SessionPageClient({ sessionId }: SessionPageClientProps) {
  const { session, isLoading: sessionLoading } = useSession(sessionId);
  const {
    rooms,
    isLoading: roomsLoading,
    selectedRoomId,
    selectRoom,
  } = useSessionRooms(sessionId);

  // Chat state — lifted from ChatView so socketRef is accessible
  const chat = useChat(sessionId);

  // Bridge Socket.io events → TanStack Query cache invalidation
  useSocketQuerySync({ sessionId, socketRef: chat.socketRef });

  const phase = session?.phase ?? 'INTAKE';

  return (
    <div className="flex h-[calc(100vh-10rem)]">
      <SessionSidebar
        phase={phase}
        totalBudget={session?.totalBudget ?? null}
        currency={session?.currency ?? 'USD'}
        stylePreferences={session?.stylePreferences ?? null}
        rooms={rooms}
        selectedRoomId={selectedRoomId}
        onSelectRoom={selectRoom}
        isLoading={sessionLoading || roomsLoading}
      />
      <div className="flex-1">
        <ChatView
          sessionId={sessionId}
          phase={phase}
          roomId={selectedRoomId ?? undefined}
          messages={chat.messages}
          sendMessage={chat.sendMessage}
          isConnected={chat.isConnected}
          error={chat.error}
          isAssistantTyping={chat.isAssistantTyping}
          isLoadingHistory={chat.isLoadingHistory}
        />
      </div>
    </div>
  );
}
```

Key changes:
- Removed `useEffect` with `window.addEventListener` (legacy bridge)
- Removed `useRef` for `lastRefetchRef`
- Added `useChat(sessionId)` call
- Added `useSocketQuerySync({ sessionId, socketRef: chat.socketRef })`
- Removed `refetch` destructuring from `useSession` and `useSessionRooms` (no longer needed manually)
- Pass all chat props to `ChatView`

**Step 2: Verify type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

**Step 3: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All pass

**Step 4: Commit**

```
refactor(session): lift useChat, wire useSocketQuerySync, remove CustomEvent bridge

- useChat moved from ChatView to SessionPageClient for socketRef access
- useSocketQuerySync now handles all Socket.io → TanStack Query cache sync
- Removed legacy window.CustomEvent bridge and 2s debounce workaround
- ChatView is now a presentational component receiving chat props
```

---

## Task 5: Enhance useSocketQuerySync with render:started

**Files:**
- Modify: `frontend/hooks/useSocketQuerySync.ts`
- Create: `frontend/__tests__/hooks/useSocketQuerySync.test.ts`

**Step 1: Write tests for useSocketQuerySync**

Create `frontend/__tests__/hooks/useSocketQuerySync.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';

// Mock socket
interface MockSocket {
  on: Mock;
  off: Mock;
  connected: boolean;
}

const mockSocket: MockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  connected: true,
};

// We need to import AFTER mocking
vi.mock('@/lib/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { useSocketQuerySync } from '@/hooks/useSocketQuerySync';

function getMockHandler<T>(eventName: string): T | undefined {
  const calls = mockSocket.on.mock.calls as Array<[string, T]>;
  return calls.find((call) => call[0] === eventName)?.[1];
}

describe('useSocketQuerySync', () => {
  let queryClient: QueryClient;

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.spyOn(queryClient, 'invalidateQueries');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should register all event listeners on mount', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };

    renderHook(
      () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
      { wrapper },
    );

    const registeredEvents = mockSocket.on.mock.calls.map((c: [string, unknown]) => c[0]);
    expect(registeredEvents).toContain('connect');
    expect(registeredEvents).toContain('session:rooms_updated');
    expect(registeredEvents).toContain('session:phase_changed');
    expect(registeredEvents).toContain('asset:processing_progress');
    expect(registeredEvents).toContain('render:started');
    expect(registeredEvents).toContain('render:complete');
    expect(registeredEvents).toContain('render:failed');
  });

  it('should remove all listeners on unmount', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };

    const { unmount } = renderHook(
      () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
      { wrapper },
    );

    unmount();

    const removedEvents = mockSocket.off.mock.calls.map((c: [string, unknown]) => c[0]);
    expect(removedEvents).toContain('connect');
    expect(removedEvents).toContain('session:rooms_updated');
    expect(removedEvents).toContain('session:phase_changed');
    expect(removedEvents).toContain('asset:processing_progress');
    expect(removedEvents).toContain('render:started');
    expect(removedEvents).toContain('render:complete');
    expect(removedEvents).toContain('render:failed');
  });

  it('should invalidate session queries on reconnection', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };

    renderHook(
      () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
      { wrapper },
    );

    const connectHandler = getMockHandler<() => void>('connect');

    // First connect — should not invalidate
    act(() => connectHandler?.());
    vi.advanceTimersByTime(500);
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();

    // Second connect (reconnection) — should invalidate
    act(() => connectHandler?.());
    vi.advanceTimersByTime(500);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['session', 'sess-1'],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['session', 'sess-1', 'rooms'],
    });
  });

  it('should invalidate rooms on phase_changed with 100ms delay', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };

    renderHook(
      () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
      { wrapper },
    );

    const handler = getMockHandler<(data: { sessionId: string; phase: string }) => void>('session:phase_changed');

    act(() => handler?.({ sessionId: 'sess-1', phase: 'CHECKLIST' }));

    // Before delay — not invalidated yet
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();

    // After delay
    vi.advanceTimersByTime(100);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['session', 'sess-1'],
    });
  });

  it('should invalidate rooms on render:complete with 500ms delay', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };

    renderHook(
      () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
      { wrapper },
    );

    const handler = getMockHandler<(data: { assetId: string; roomId: string }) => void>('render:complete');

    act(() => handler?.({ assetId: 'a-1', roomId: 'r-1' }));

    vi.advanceTimersByTime(499);
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['session', 'sess-1', 'rooms'],
    });
  });

  it('should ignore events from different sessions', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };

    renderHook(
      () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
      { wrapper },
    );

    const handler = getMockHandler<(data: { sessionId: string }) => void>('session:rooms_updated');

    act(() => handler?.({ sessionId: 'different-session' }));
    vi.advanceTimersByTime(500);

    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run __tests__/hooks/useSocketQuerySync.test.ts`
Expected: FAIL — `render:started` listener not registered

**Step 3: Add render:started handler to useSocketQuerySync**

In `frontend/hooks/useSocketQuerySync.ts`, add after the `handleRenderFailed` function (line 136):

```typescript
const handleRenderStarted = (data: { assetId: string; roomId: string; sessionId: string }) => {
  if (data.sessionId !== sessionId) return;
  logger.info('Render started', {
    assetId: data.assetId,
    roomId: data.roomId,
  });
  // No query invalidation needed — progress hooks handle the UI state.
  // This event is registered so useSocketQuerySync is the single source
  // of truth for all render-related Socket.io events.
};
```

Register and clean up:
```typescript
socket.on('render:started', handleRenderStarted);
// ...
socket.off('render:started', handleRenderStarted);
```

**Step 4: Run tests**

Run: `cd frontend && npx vitest run __tests__/hooks/useSocketQuerySync.test.ts`
Expected: All pass

**Step 5: Commit**

```
test(useSocketQuerySync): add test suite, register render:started handler
```

---

## Task 6: Create useAssetProcessingState Hook

**Files:**
- Create: `frontend/hooks/useAssetProcessingState.ts`
- Create: `frontend/__tests__/hooks/useAssetProcessingState.test.ts`

**Step 1: Write tests**

Create `frontend/__tests__/hooks/useAssetProcessingState.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

interface MockSocket {
  on: Mock;
  off: Mock;
}

const mockSocket: MockSocket = {
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('@/lib/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { useAssetProcessingState } from '@/hooks/useAssetProcessingState';

function getMockHandler<T>(eventName: string): T | undefined {
  const calls = mockSocket.on.mock.calls as Array<[string, T]>;
  return calls.find((call) => call[0] === eventName)?.[1];
}

describe('useAssetProcessingState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should start with empty processing map', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };
    const { result } = renderHook(() => useAssetProcessingState(socketRef));

    expect(result.current.processingAssets.size).toBe(0);
  });

  it('should track asset processing progress', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };
    const { result } = renderHook(() => useAssetProcessingState(socketRef));

    const handler = getMockHandler<(data: { assetId: string; status: string; progress: number; variantType?: string }) => void>('asset:processing_progress');

    act(() => {
      handler?.({ assetId: 'asset-1', status: 'processing', progress: 50, variantType: 'thumbnail' });
    });

    expect(result.current.processingAssets.size).toBe(1);
    const asset = result.current.processingAssets.get('asset-1');
    expect(asset?.status).toBe('processing');
    expect(asset?.progress).toBe(50);
  });

  it('should remove completed assets after display delay', () => {
    vi.useFakeTimers();
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };
    const { result } = renderHook(() => useAssetProcessingState(socketRef));

    const handler = getMockHandler<(data: { assetId: string; status: string; progress: number }) => void>('asset:processing_progress');

    act(() => {
      handler?.({ assetId: 'asset-1', status: 'processing', progress: 50 });
    });
    expect(result.current.processingAssets.size).toBe(1);

    act(() => {
      handler?.({ assetId: 'asset-1', status: 'ready', progress: 100 });
    });

    // Still visible immediately (for transition animation)
    expect(result.current.processingAssets.get('asset-1')?.status).toBe('ready');

    // Removed after 2s display delay
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.processingAssets.size).toBe(0);

    vi.useRealTimers();
  });

  it('should clear all state on reconnect', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };
    const { result } = renderHook(() => useAssetProcessingState(socketRef));

    const progressHandler = getMockHandler<(data: { assetId: string; status: string; progress: number }) => void>('asset:processing_progress');
    const connectHandler = getMockHandler<() => void>('connect');

    act(() => {
      progressHandler?.({ assetId: 'asset-1', status: 'processing', progress: 50 });
    });
    expect(result.current.processingAssets.size).toBe(1);

    // Simulate reconnect
    act(() => connectHandler?.());
    expect(result.current.processingAssets.size).toBe(0);
  });

  it('should clean up listeners on unmount', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };
    const { unmount } = renderHook(() => useAssetProcessingState(socketRef));

    unmount();

    const removedEvents = mockSocket.off.mock.calls.map((c: [string, unknown]) => c[0]);
    expect(removedEvents).toContain('asset:processing_progress');
    expect(removedEvents).toContain('connect');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run __tests__/hooks/useAssetProcessingState.test.ts`
Expected: FAIL — module not found

**Step 3: Implement useAssetProcessingState**

Create `frontend/hooks/useAssetProcessingState.ts`:

```typescript
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { Logger } from '@/lib/logger';

const logger = new Logger({ serviceName: 'AssetProcessingState' });

/** How long to keep a completed/failed entry visible for UI transitions */
const COMPLETION_DISPLAY_MS = 2000;

export interface AssetProcessingEntry {
  assetId: string;
  status: 'processing' | 'ready' | 'failed';
  progress: number;
  variantType?: string;
}

/**
 * Tracks in-flight asset processing (image optimization) via Socket.io events.
 * Provides real-time progress for UI display without REST polling.
 *
 * On reconnection, clears all state — useSocketQuerySync handles
 * fetching the final state from REST.
 */
export function useAssetProcessingState(socketRef: React.RefObject<Socket | null>) {
  const [processingAssets, setProcessingAssets] = useState<Map<string, AssetProcessingEntry>>(new Map());
  const removalTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearAll = useCallback(() => {
    setProcessingAssets(new Map());
    for (const timer of removalTimers.current.values()) {
      clearTimeout(timer);
    }
    removalTimers.current.clear();
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleProgress = (data: { assetId: string; status: string; progress: number; variantType?: string }) => {
      logger.info('Asset processing progress', { assetId: data.assetId, status: data.status, progress: data.progress });

      setProcessingAssets((prev) => {
        const next = new Map(prev);
        next.set(data.assetId, {
          assetId: data.assetId,
          status: data.status as AssetProcessingEntry['status'],
          progress: data.progress,
          variantType: data.variantType,
        });
        return next;
      });

      // Schedule removal for completed/failed assets
      if (data.status === 'ready' || data.status === 'failed') {
        // Clear any existing removal timer for this asset
        const existing = removalTimers.current.get(data.assetId);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
          removalTimers.current.delete(data.assetId);
          setProcessingAssets((prev) => {
            const next = new Map(prev);
            next.delete(data.assetId);
            return next;
          });
        }, COMPLETION_DISPLAY_MS);

        removalTimers.current.add(data.assetId, timer);
      }
    };

    const handleConnect = () => {
      // On reconnect, clear stale progress state
      clearAll();
    };

    socket.on('asset:processing_progress', handleProgress);
    socket.on('connect', handleConnect);

    const timers = removalTimers.current;

    return () => {
      socket.off('asset:processing_progress', handleProgress);
      socket.off('connect', handleConnect);

      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, [socketRef, clearAll]);

  return { processingAssets };
}
```

Note: Fix `removalTimers.current.add` → `removalTimers.current.set` (Map uses `.set()`).

**Step 4: Run tests**

Run: `cd frontend && npx vitest run __tests__/hooks/useAssetProcessingState.test.ts`
Expected: All 5 tests pass

**Step 5: Commit**

```
feat(hooks): add useAssetProcessingState for real-time image optimization progress
```

---

## Task 7: Create useRenderState Hook

**Files:**
- Create: `frontend/hooks/useRenderState.ts`
- Create: `frontend/__tests__/hooks/useRenderState.test.ts`

**Step 1: Write tests**

Create `frontend/__tests__/hooks/useRenderState.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

interface MockSocket {
  on: Mock;
  off: Mock;
}

const mockSocket: MockSocket = {
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('@/lib/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { useRenderState } from '@/hooks/useRenderState';

function getMockHandler<T>(eventName: string): T | undefined {
  const calls = mockSocket.on.mock.calls as Array<[string, T]>;
  return calls.find((call) => call[0] === eventName)?.[1];
}

describe('useRenderState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should start with empty renders map', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };
    const { result } = renderHook(() => useRenderState(socketRef));

    expect(result.current.activeRenders.size).toBe(0);
  });

  it('should track render:started', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };
    const { result } = renderHook(() => useRenderState(socketRef));

    const handler = getMockHandler<(data: { assetId: string; roomId: string; sessionId: string }) => void>('render:started');

    act(() => {
      handler?.({ assetId: 'asset-1', roomId: 'room-1', sessionId: 'sess-1' });
    });

    expect(result.current.activeRenders.size).toBe(1);
    const render = result.current.activeRenders.get('asset-1');
    expect(render?.status).toBe('started');
    expect(render?.roomId).toBe('room-1');
  });

  it('should update to complete on render:complete', () => {
    vi.useFakeTimers();
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };
    const { result } = renderHook(() => useRenderState(socketRef));

    const startHandler = getMockHandler<(data: { assetId: string; roomId: string; sessionId: string }) => void>('render:started');
    const completeHandler = getMockHandler<(data: { assetId: string; roomId: string }) => void>('render:complete');

    act(() => {
      startHandler?.({ assetId: 'asset-1', roomId: 'room-1', sessionId: 'sess-1' });
    });

    act(() => {
      completeHandler?.({ assetId: 'asset-1', roomId: 'room-1' });
    });

    expect(result.current.activeRenders.get('asset-1')?.status).toBe('complete');

    // Removed after display delay
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.activeRenders.size).toBe(0);

    vi.useRealTimers();
  });

  it('should update to failed on render:failed', () => {
    vi.useFakeTimers();
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };
    const { result } = renderHook(() => useRenderState(socketRef));

    const startHandler = getMockHandler<(data: { assetId: string; roomId: string; sessionId: string }) => void>('render:started');
    const failHandler = getMockHandler<(data: { assetId: string; roomId: string; error: string }) => void>('render:failed');

    act(() => {
      startHandler?.({ assetId: 'asset-1', roomId: 'room-1', sessionId: 'sess-1' });
    });

    act(() => {
      failHandler?.({ assetId: 'asset-1', roomId: 'room-1', error: 'Generation failed' });
    });

    const render = result.current.activeRenders.get('asset-1');
    expect(render?.status).toBe('failed');
    expect(render?.error).toBe('Generation failed');

    // Removed after display delay
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.activeRenders.size).toBe(0);

    vi.useRealTimers();
  });

  it('should clear all state on reconnect', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };
    const { result } = renderHook(() => useRenderState(socketRef));

    const startHandler = getMockHandler<(data: { assetId: string; roomId: string; sessionId: string }) => void>('render:started');
    const connectHandler = getMockHandler<() => void>('connect');

    act(() => {
      startHandler?.({ assetId: 'asset-1', roomId: 'room-1', sessionId: 'sess-1' });
    });
    expect(result.current.activeRenders.size).toBe(1);

    act(() => connectHandler?.());
    expect(result.current.activeRenders.size).toBe(0);
  });

  it('should clean up listeners on unmount', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };
    const { unmount } = renderHook(() => useRenderState(socketRef));

    unmount();

    const removedEvents = mockSocket.off.mock.calls.map((c: [string, unknown]) => c[0]);
    expect(removedEvents).toContain('render:started');
    expect(removedEvents).toContain('render:complete');
    expect(removedEvents).toContain('render:failed');
    expect(removedEvents).toContain('connect');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run __tests__/hooks/useRenderState.test.ts`
Expected: FAIL — module not found

**Step 3: Implement useRenderState**

Create `frontend/hooks/useRenderState.ts`:

```typescript
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { Logger } from '@/lib/logger';

const logger = new Logger({ serviceName: 'RenderState' });

/** Display delay for completed renders before removal */
const COMPLETE_DISPLAY_MS = 3000;
/** Display delay for failed renders before removal */
const FAILED_DISPLAY_MS = 5000;

export interface RenderEntry {
  assetId: string;
  roomId: string;
  status: 'started' | 'complete' | 'failed';
  error?: string;
}

/**
 * Tracks in-flight render generation jobs via Socket.io events.
 * Provides real-time status for UI display without REST polling.
 *
 * On reconnection, clears all state — useSocketQuerySync handles
 * fetching the final state from REST.
 */
export function useRenderState(socketRef: React.RefObject<Socket | null>) {
  const [activeRenders, setActiveRenders] = useState<Map<string, RenderEntry>>(new Map());
  const removalTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearAll = useCallback(() => {
    setActiveRenders(new Map());
    for (const timer of removalTimers.current.values()) {
      clearTimeout(timer);
    }
    removalTimers.current.clear();
  }, []);

  const scheduleRemoval = useCallback((assetId: string, delayMs: number) => {
    const existing = removalTimers.current.get(assetId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      removalTimers.current.delete(assetId);
      setActiveRenders((prev) => {
        const next = new Map(prev);
        next.delete(assetId);
        return next;
      });
    }, delayMs);

    removalTimers.current.set(assetId, timer);
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleStarted = (data: { assetId: string; roomId: string; sessionId: string }) => {
      logger.info('Render started', { assetId: data.assetId, roomId: data.roomId });
      setActiveRenders((prev) => {
        const next = new Map(prev);
        next.set(data.assetId, {
          assetId: data.assetId,
          roomId: data.roomId,
          status: 'started',
        });
        return next;
      });
    };

    const handleComplete = (data: { assetId: string; roomId: string }) => {
      logger.info('Render complete', { assetId: data.assetId, roomId: data.roomId });
      setActiveRenders((prev) => {
        const next = new Map(prev);
        const existing = prev.get(data.assetId);
        next.set(data.assetId, {
          assetId: data.assetId,
          roomId: existing?.roomId ?? data.roomId,
          status: 'complete',
        });
        return next;
      });
      scheduleRemoval(data.assetId, COMPLETE_DISPLAY_MS);
    };

    const handleFailed = (data: { assetId: string; roomId: string; error: string }) => {
      logger.warn('Render failed', undefined, { assetId: data.assetId, error: data.error });
      setActiveRenders((prev) => {
        const next = new Map(prev);
        next.set(data.assetId, {
          assetId: data.assetId,
          roomId: data.roomId,
          status: 'failed',
          error: data.error,
        });
        return next;
      });
      scheduleRemoval(data.assetId, FAILED_DISPLAY_MS);
    };

    const handleConnect = () => {
      clearAll();
    };

    socket.on('render:started', handleStarted);
    socket.on('render:complete', handleComplete);
    socket.on('render:failed', handleFailed);
    socket.on('connect', handleConnect);

    const timers = removalTimers.current;

    return () => {
      socket.off('render:started', handleStarted);
      socket.off('render:complete', handleComplete);
      socket.off('render:failed', handleFailed);
      socket.off('connect', handleConnect);

      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, [socketRef, clearAll, scheduleRemoval]);

  return { activeRenders };
}
```

**Step 4: Run tests**

Run: `cd frontend && npx vitest run __tests__/hooks/useRenderState.test.ts`
Expected: All 6 tests pass

**Step 5: Commit**

```
feat(hooks): add useRenderState for real-time render generation progress
```

---

## Task 8: Full Integration Verification

**Files:** None (verification only)

**Step 1: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

**Step 2: Run type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

**Step 3: Run lint**

Run: `cd frontend && npm run lint`
Expected: 0 errors

**Step 4: Run backend tests (regression check)**

Run: `cd backend && npm run test:unit`
Expected: All pass

**Step 5: Final commit (if any fixups needed)**

Only if previous steps surface issues.

---

## Summary of All Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/shared-types/src/socket-events.ts` | Modify | Add 3 render event payload types + ServerToClientEvents entries |
| `packages/shared-types/src/index.ts` | Modify | Export new render event types |
| `frontend/hooks/useChat.ts` | Modify | Expose `socketRef`, remove CustomEvent dispatches |
| `frontend/__tests__/hooks/useChat.test.ts` | Modify | Fix 2 pre-existing failures, add socketRef + bridge removal tests |
| `frontend/components/chat/chat-view.tsx` | Modify | Accept chat props instead of calling useChat |
| `frontend/components/session/session-page-client.tsx` | Modify | Lift useChat, wire useSocketQuerySync, remove legacy bridge |
| `frontend/hooks/useSocketQuerySync.ts` | Modify | Add render:started handler |
| `frontend/__tests__/hooks/useSocketQuerySync.test.ts` | Create | 6 tests for delayed invalidation, reconnect recovery, session filtering |
| `frontend/hooks/useAssetProcessingState.ts` | Create | Real-time progress tracking for image optimization |
| `frontend/__tests__/hooks/useAssetProcessingState.test.ts` | Create | 5 tests for progress tracking, completion cleanup, reconnect reset |
| `frontend/hooks/useRenderState.ts` | Create | Real-time progress tracking for render generation |
| `frontend/__tests__/hooks/useRenderState.test.ts` | Create | 6 tests for lifecycle tracking, error state, reconnect reset |
