import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCreateCheckout, useDevComplete } from '@/hooks/usePayment';
import { fetchWithAuth } from '@/lib/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock fetchWithAuth
vi.mock('@/lib/api', () => ({
  fetchWithAuth: vi.fn(),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientWrapper';
  return Wrapper;
};

describe('usePayment hooks', () => {
  const sessionId = 'test-session-id';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useCreateCheckout', () => {
    it('calls /api/payments/checkout/:sessionId on mutation', async () => {
      const mockResponse = { url: 'https://stripe.com/checkout', checkoutSessionId: 'cs_123' };
      vi.mocked(fetchWithAuth).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useCreateCheckout(sessionId), {
        wrapper: createWrapper(),
      });

      const data = await result.current.mutateAsync();

      expect(fetchWithAuth).toHaveBeenCalledWith(`/api/payments/checkout/${sessionId}`, {
        method: 'POST',
      });
      expect(data).toEqual(mockResponse);
    });
  });

  describe('useDevComplete', () => {
    it('calls /api/payments/dev-complete/:sessionId on mutation', async () => {
      const mockResponse = { devBypass: true, warning: 'test', sessionId };
      vi.mocked(fetchWithAuth).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useDevComplete(sessionId), {
        wrapper: createWrapper(),
      });

      const data = await result.current.mutateAsync();

      expect(fetchWithAuth).toHaveBeenCalledWith(`/api/payments/dev-complete/${sessionId}`, {
        method: 'POST',
      });
      expect(data).toEqual(mockResponse);
    });
  });
});
