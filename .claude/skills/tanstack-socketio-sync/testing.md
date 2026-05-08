# Testing

## Test Setup

### Mock Socket

Create a minimal mock socket with `on` and `off` methods:

```typescript
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
```

### Mock Logger

Mock the browser Logger before importing the hook:

```typescript
vi.mock('@/lib/logger', () => ({
  Logger: class MockLogger {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
  },
}));
```

### QueryClient Wrapper

Provide a fresh QueryClient for each test with `invalidateQueries` spied:

```typescript
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
```

### Handler Extraction Utility

Extract registered handlers by event name from mock socket calls:

```typescript
function getMockHandler<T>(eventName: string): T | undefined {
  const calls = mockSocket.on.mock.calls as Array<[string, T]>;
  return calls.find((call) => call[0] === eventName)?.[1];
}
```

## Test Patterns

### 1. Verify All Listeners Registered

```typescript
it('should register all event listeners on mount', () => {
  const socketRef = { current: mockSocket as unknown as Socket };
  renderHook(
    () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
    { wrapper },
  );

  const registeredEvents = (mockSocket.on.mock.calls as [string, unknown][]).map((c) => c[0]);
  expect(registeredEvents).toContain('connect');
  expect(registeredEvents).toContain('session:rooms_updated');
  expect(registeredEvents).toContain('session:phase_changed');
  // ... all expected events
});
```

### 2. Verify All Listeners Cleaned Up

```typescript
it('should remove all listeners on unmount', () => {
  const socketRef = { current: mockSocket as unknown as Socket };
  const { unmount } = renderHook(
    () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
    { wrapper },
  );
  unmount();

  const removedEvents = (mockSocket.off.mock.calls as [string, unknown][]).map((c) => c[0]);
  expect(removedEvents).toContain('connect');
  expect(removedEvents).toContain('session:rooms_updated');
  // ... all expected events
});
```

### 3. Test Delayed Invalidation Timing

Use `vi.useFakeTimers()` and `vi.advanceTimersByTime()` to test exact delay behavior:

```typescript
it('should invalidate session on phase_changed with 100ms delay', () => {
  const socketRef = { current: mockSocket as unknown as Socket };
  renderHook(
    () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
    { wrapper },
  );

  const handler = getMockHandler<(data: { sessionId: string; phase: string }) => void>(
    'session:phase_changed'
  );

  act(() => handler?.({ sessionId: 'sess-1', phase: 'CHECKLIST' }));

  // Before delay — should NOT have invalidated yet
  expect(queryClient.invalidateQueries).not.toHaveBeenCalled();

  // Advance past the 100ms delay
  act(() => vi.advanceTimersByTime(100));
  expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
    queryKey: ['session', 'sess-1'],
  });
});
```

### 4. Test SessionId Filtering

```typescript
it('should ignore events from different sessions', () => {
  const socketRef = { current: mockSocket as unknown as Socket };
  renderHook(
    () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
    { wrapper },
  );

  const handler = getMockHandler<(data: { sessionId: string }) => void>(
    'session:rooms_updated'
  );

  act(() => handler?.({ sessionId: 'different-session' }));
  act(() => vi.advanceTimersByTime(500));

  expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
});
```

### 5. Test Reconnection Recovery

```typescript
it('should invalidate all queries on reconnection (not first connect)', () => {
  const socketRef = { current: mockSocket as unknown as Socket };
  renderHook(
    () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
    { wrapper },
  );

  const connectHandler = getMockHandler<() => void>('connect');

  // First connect — should NOT invalidate
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
```

### 6. Test Conditional Invalidation

```typescript
it('should only invalidate rooms on asset terminal status', () => {
  const socketRef = { current: mockSocket as unknown as Socket };
  renderHook(
    () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
    { wrapper },
  );

  const handler = getMockHandler<(data: { assetId: string; status: string }) => void>(
    'asset:processing_progress'
  );

  // 'processing' status — no invalidation
  act(() => handler?.({ assetId: 'a-1', status: 'processing' }));
  act(() => vi.advanceTimersByTime(1000));
  expect(queryClient.invalidateQueries).not.toHaveBeenCalled();

  // 'ready' status — should invalidate
  act(() => handler?.({ assetId: 'a-1', status: 'ready' }));
  act(() => vi.advanceTimersByTime(500));
  expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
    queryKey: ['session', 'sess-1', 'rooms'],
  });
});
```

### 7. Test Exact Delay Boundary

Test that invalidation happens exactly at the specified delay, not before:

```typescript
it('should invalidate rooms on render:complete with exactly 500ms delay', () => {
  // ... setup ...
  act(() => handler?.({ assetId: 'a-1', roomId: 'r-1' }));

  // 499ms — not yet
  act(() => vi.advanceTimersByTime(499));
  expect(queryClient.invalidateQueries).not.toHaveBeenCalled();

  // 500ms — now
  act(() => vi.advanceTimersByTime(1));
  expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
    queryKey: ['session', 'sess-1', 'rooms'],
  });
});
```

## Testing Progress State Hooks

For `useAssetProcessingState` and `useRenderState`, test:

1. **State updates on events**: Verify the Map is updated correctly
2. **Timed removal**: Use `vi.advanceTimersByTime()` to verify entries are removed after display period
3. **Reconnect clearing**: Verify `clearAll()` runs on `connect` event
4. **Timer cleanup on unmount**: Verify no timers leak after unmount

```typescript
it('should clear all state on reconnection', () => {
  // ... setup with some active renders ...
  const connectHandler = getMockHandler<() => void>('connect');
  act(() => connectHandler?.());
  expect(result.current.activeRenders.size).toBe(0);
});
```

## Test File Location

All hook tests live in `frontend/__tests__/hooks/`:
- `useSocketQuerySync.test.tsx`
- `useAssetProcessingState.test.tsx` (if exists)
- `useRenderState.test.tsx` (if exists)

Run with: `npm run test:unit` from the `frontend/` directory.
