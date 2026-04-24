'use client';

import { useMutation } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/api';

interface CheckoutResponse {
  url: string | null;
  checkoutSessionId?: string;
  devBypass?: boolean;
  message?: string;
}

interface DevCompleteResponse {
  devBypass: boolean;
  warning: string;
  sessionId: string;
  alreadyPaid?: boolean;
}

/**
 * Mutation hook to create a Stripe Checkout Session.
 *
 * On success:
 * - If `devBypass` is true, the caller should show the dev bypass UI.
 * - If `url` is present, redirect to Stripe Checkout: `window.location.href = url`
 */
export function useCreateCheckout(sessionId: string) {
  return useMutation<CheckoutResponse, Error>({
    mutationFn: async () => {
      return fetchWithAuth(`/api/payments/checkout/${sessionId}`, {
        method: 'POST',
      });
    },
  });
}

/**
 * Mutation hook for dev-only payment bypass.
 * Calls POST /api/payments/dev-complete/:sessionId.
 * Only available when backend has isPaymentsEnabled() === false.
 */
export function useDevComplete(sessionId: string) {
  return useMutation<DevCompleteResponse, Error>({
    mutationFn: async () => {
      return fetchWithAuth(`/api/payments/dev-complete/${sessionId}`, {
        method: 'POST',
      });
    },
  });
}
