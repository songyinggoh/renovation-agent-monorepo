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

vi.mock('@/lib/logger', () => {
  class MockLogger {
    info() {}
    warn() {}
    error() {}
    debug() {}
  }
  return { Logger: MockLogger };
});

import { useAssetProcessingState } from '@/hooks/useAssetProcessingState';
import type { Socket } from 'socket.io-client';

function getMockHandler<T>(eventName: string): T | undefined {
  const calls = mockSocket.on.mock.calls as Array<[string, T]>;
  return calls.find((call) => call[0] === eventName)?.[1];
}

describe('useAssetProcessingState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should start with empty processing map', () => {
    const socketRef = { current: mockSocket as unknown as Socket };
    const { result } = renderHook(() => useAssetProcessingState(socketRef));

    expect(result.current.processingAssets.size).toBe(0);
  });

  it('should track asset processing progress', () => {
    const socketRef = { current: mockSocket as unknown as Socket };
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
    const socketRef = { current: mockSocket as unknown as Socket };
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
    const socketRef = { current: mockSocket as unknown as Socket };
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
    const socketRef = { current: mockSocket as unknown as Socket };
    const { unmount } = renderHook(() => useAssetProcessingState(socketRef));

    unmount();

    const removedEvents = mockSocket.off.mock.calls.map((c: [string, unknown]) => c[0]);
    expect(removedEvents).toContain('asset:processing_progress');
    expect(removedEvents).toContain('connect');
  });
});
