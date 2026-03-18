---
plan: "4.4"
wave: 4
depends_on: ["4.2"]
title: "Frontend: payment hook, PAYMENT phase UI, Socket.io listener, success/cancel handling"
files_modified:
  - frontend/hooks/usePayment.ts
  - frontend/hooks/useSocketQuerySync.ts
  - frontend/components/payment/payment-panel.tsx
  - frontend/components/session/session-page-client.tsx
autonomous: false
must_haves:
  truths:
    - "User sees a Pay Now button during PAYMENT phase that redirects to Stripe Checkout"
    - "When isPaymentsEnabled is false (devBypass), user sees Skip Payment (Dev Mode) button"
    - "After payment, ?payment=success shows a spinner that resolves on payment:completed Socket.io event"
    - "After cancellation, ?payment=cancelled shows a try-again message"
    - "payment:completed Socket.io event invalidates the session query so phase updates to COMPLETE"
  artifacts:
    - path: "frontend/hooks/usePayment.ts"
      provides: "useCreateCheckout mutation hook, useDevComplete mutation hook"
      exports: ["useCreateCheckout", "useDevComplete"]
    - path: "frontend/components/payment/payment-panel.tsx"
      provides: "PaymentPanel component for PAYMENT phase"
      exports: ["PaymentPanel"]
    - path: "frontend/hooks/useSocketQuerySync.ts"
      provides: "payment:completed listener that invalidates session query"
      contains: "payment:completed"
  key_links:
    - from: "frontend/hooks/usePayment.ts"
      to: "/api/payments/checkout/:sessionId"
      via: "fetchWithAuth POST"
      pattern: "fetchWithAuth.*payments/checkout"
    - from: "frontend/hooks/useSocketQuerySync.ts"
      to: "packages/shared-types/src/socket-events.ts"
      via: "payment:completed event listener"
      pattern: "payment:completed"
    - from: "frontend/components/session/session-page-client.tsx"
      to: "frontend/components/payment/payment-panel.tsx"
      via: "conditional render during PAYMENT phase"
      pattern: "PaymentPanel"
---

<objective>
Build the frontend payment UI: a TanStack Query mutation hook for checkout creation, a payment panel component for the PAYMENT phase, Socket.io event handling for payment:completed, and success/cancel URL parameter handling.

Purpose: This connects the user-facing experience to the backend payment pipeline. Without it, users cannot initiate payment, see payment status, or transition to COMPLETE after paying.

Output: Payment hook, payment panel component, updated Socket.io sync hook, updated session page.
</objective>

<context>
@.planning/phases/phase-4-payment/4-02-SUMMARY.md
@frontend/hooks/useRequestRender.ts (mutation hook pattern to follow)
@frontend/hooks/useSocketQuerySync.ts (Socket.io event listener pattern)
@frontend/hooks/useSession.ts (sessionQueryKey pattern)
@frontend/lib/api.ts (fetchWithAuth pattern)
@frontend/components/session/session-page-client.tsx (current session page)
@.planning/phases/phase-4-payment/RESEARCH.md (Frontend Payment Hook Pattern, Socket.io handler)
</context>

<tasks>

<task id="4.4.1" title="Create usePayment hook and add payment:completed to useSocketQuerySync">
  <read_first>
    - frontend/hooks/useRequestRender.ts -- exact mutation hook pattern (useMutation, fetchWithAuth, queryClient)
    - frontend/hooks/useSocketQuerySync.ts -- existing Socket.io event handler registration pattern
    - frontend/hooks/useSession.ts -- sessionQueryKey for cache invalidation
    - frontend/lib/api.ts -- fetchWithAuth signature
    - .planning/phases/phase-4-payment/RESEARCH.md -- Frontend Payment Hook Pattern, Socket.io Payment Event Handler
  </read_first>
  <action>
    **1. Create `frontend/hooks/usePayment.ts`:**

    ```typescript
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
    ```

    Pattern notes:
    - Matches `useRequestRender.ts` mutation hook pattern exactly
    - No `onSuccess` handler with redirect -- the component handles the redirect decision based on the response (devBypass vs url)
    - No optimistic updates needed -- the payment flow is a redirect, not an in-page mutation

    **2. Add `payment:completed` and `payment:failed` listeners to `frontend/hooks/useSocketQuerySync.ts`:**

    Add two new handler functions inside the `useEffect`:

    ```typescript
    // --- Payment events ---
    const handlePaymentCompleted = (data: { sessionId: string }) => {
      if (data.sessionId !== sessionId) return;
      logger.info('Payment completed — invalidating session query', { sessionId });
      // Delay slightly to ensure DB write from webhook has propagated
      delayedInvalidate(sessionQueryKey(sessionId), JOB_COMPLETE_DELAY_MS);
    };

    const handlePaymentFailed = (data: { sessionId: string; reason?: string }) => {
      if (data.sessionId !== sessionId) return;
      logger.warn('Payment failed', undefined, {
        sessionId,
        reason: data.reason,
      });
      // Invalidate to reflect any state changes
      delayedInvalidate(sessionQueryKey(sessionId), JOB_COMPLETE_DELAY_MS);
    };
    ```

    Register them in the listener block:
    ```typescript
    socket.on('payment:completed', handlePaymentCompleted);
    socket.on('payment:failed', handlePaymentFailed);
    ```

    Add cleanup in the return function:
    ```typescript
    socket.off('payment:completed', handlePaymentCompleted);
    socket.off('payment:failed', handlePaymentFailed);
    ```
  </action>
  <acceptance_criteria>
    - `test -f frontend/hooks/usePayment.ts && echo "exists"` outputs "exists"
    - `grep "useCreateCheckout" frontend/hooks/usePayment.ts` shows the export
    - `grep "useDevComplete" frontend/hooks/usePayment.ts` shows the export
    - `grep "payments/checkout" frontend/hooks/usePayment.ts` shows the API call
    - `grep "payment:completed" frontend/hooks/useSocketQuerySync.ts` shows the new listener
    - `grep "payment:failed" frontend/hooks/useSocketQuerySync.ts` shows the new listener
    - `cd frontend && npm run type-check` passes
  </acceptance_criteria>
</task>

<task id="4.4.2" title="Create PaymentPanel component and integrate into session page">
  <read_first>
    - frontend/components/session/session-page-client.tsx -- how the session page renders phase-specific content
    - frontend/hooks/usePayment.ts -- useCreateCheckout and useDevComplete hooks (from task 4.4.1)
    - frontend/hooks/useSession.ts -- session object shape, phase field
    - frontend/components/ui/ -- available shadcn components (Button, Card, etc.)
    - frontend/lib/design-tokens.ts -- PHASE_INDEX, RenovationPhase type
  </read_first>
  <action>
    **1. Create `frontend/components/payment/payment-panel.tsx`:**

    A component that renders differently based on three states:
    - **Default (PAYMENT phase, not yet paid):** Shows pricing info + "Pay Now" button
    - **Dev bypass:** Shows "Skip Payment (Dev Mode)" button
    - **Payment success (returning from Stripe):** Shows spinner + "Completing payment..." text

    ```typescript
    'use client';

    import { useState, useEffect } from 'react';
    import { useSearchParams } from 'next/navigation';
    import { useCreateCheckout, useDevComplete } from '@/hooks/usePayment';
    import { Button } from '@/components/ui/button';
    import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

    interface PaymentPanelProps {
      sessionId: string;
      isPaid: boolean;
    }

    export function PaymentPanel({ sessionId, isPaid }: PaymentPanelProps) {
      const searchParams = useSearchParams();
      const paymentStatus = searchParams.get('payment');
      const createCheckout = useCreateCheckout(sessionId);
      const devComplete = useDevComplete(sessionId);
      const [isDevBypass, setIsDevBypass] = useState(false);

      // Handle Stripe redirect return
      const isReturningFromStripe = paymentStatus === 'success' && !isPaid;
      const wasCancelled = paymentStatus === 'cancelled';

      // If paid (either from webhook or refresh), show success
      if (isPaid) {
        return (
          <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl mb-2">&#10003;</div>
                <p className="font-semibold text-green-700 dark:text-green-300">
                  Payment complete!
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your renovation plan is ready.
                </p>
              </div>
            </CardContent>
          </Card>
        );
      }

      // Returning from Stripe success_url — waiting for webhook to fulfill
      if (isReturningFromStripe) {
        return (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                <p className="font-semibold">Completing payment...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Please wait while we confirm your payment. This usually takes a few seconds.
                </p>
              </div>
            </CardContent>
          </Card>
        );
      }

      const handlePayNow = async () => {
        const result = await createCheckout.mutateAsync();
        if (result.devBypass) {
          setIsDevBypass(true);
        } else if (result.url) {
          window.location.href = result.url;
        }
      };

      const handleDevComplete = async () => {
        await devComplete.mutateAsync();
        // The payment:completed Socket.io event will invalidate the session query
        // and the component will re-render with isPaid=true
      };

      return (
        <Card>
          <CardHeader>
            <CardTitle>Complete Your Renovation Plan</CardTitle>
            <CardDescription>
              Unlock your full renovation package including AI renders, detailed documents, and shopping lists.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {wasCancelled && (
              <div className="p-3 rounded-md bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300 text-sm">
                Payment was cancelled. You can try again when you are ready.
              </div>
            )}

            {isDevBypass ? (
              <div className="space-y-3">
                <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-sm">
                  Stripe is not configured. Use the dev bypass to skip payment.
                </div>
                <Button
                  onClick={handleDevComplete}
                  disabled={devComplete.isPending}
                  variant="outline"
                  className="w-full"
                >
                  {devComplete.isPending ? 'Processing...' : 'Skip Payment (Dev Mode)'}
                </Button>
              </div>
            ) : (
              <Button
                onClick={handlePayNow}
                disabled={createCheckout.isPending}
                className="w-full"
                size="lg"
              >
                {createCheckout.isPending ? 'Preparing checkout...' : 'Pay Now'}
              </Button>
            )}

            {(createCheckout.error || devComplete.error) && (
              <p className="text-sm text-destructive">
                {createCheckout.error?.message || devComplete.error?.message}
              </p>
            )}
          </CardContent>
        </Card>
      );
    }
    ```

    Implementation notes:
    - Use `useSearchParams()` from `next/navigation` to read `?payment=success|cancelled`
    - The "Completing payment..." spinner relies on the `payment:completed` Socket.io event (handled by useSocketQuerySync from task 4.4.1) to invalidate the session query, which updates `isPaid` to `true` and this component re-renders to the success state
    - If the webhook fires before the user returns to success_url, the session query will already show `isPaid=true` and the spinner won't show at all (correct behavior)
    - No `@stripe/stripe-js` import needed -- we redirect to Stripe's hosted page via `window.location.href`

    **2. Integrate PaymentPanel into `frontend/components/session/session-page-client.tsx`:**

    Add import:
    ```typescript
    import { PaymentPanel } from '@/components/payment/payment-panel';
    ```

    Add a section that renders PaymentPanel when the session is in the PAYMENT phase. Add it alongside the existing render gallery conditional. The exact placement depends on the current layout, but the pattern is:

    ```typescript
    const showPayment = phase === 'PAYMENT' || (phase === 'COMPLETE' && !!searchParams.get('payment'));
    ```

    Then in the JSX, add:
    ```tsx
    {showPayment && (
      <PaymentPanel
        sessionId={sessionId}
        isPaid={session?.isPaid ?? false}
      />
    )}
    ```

    The session page client will need to import `useSearchParams` from `next/navigation` if it does not already.

    Note: The `session` object from `useSession` must include `isPaid` in its return value. Check `frontend/lib/api-mappers.ts` to ensure `isPaid` is mapped from the API response. If not, add it to the mapper.

    **3. Verify `isPaid` is available on the session object in the frontend:**

    Check `frontend/lib/api-mappers.ts` (or wherever `mapSessionResponse` is defined). The `isPaid` field from the backend response must be mapped through. If the mapper explicitly picks fields, add `isPaid`. If it passes through all fields, no change needed.

    Also check the frontend TypeScript types -- if there's a `Session` type in `frontend/types/`, ensure it includes `isPaid: boolean`.
  </action>
  <acceptance_criteria>
    - `test -f frontend/components/payment/payment-panel.tsx && echo "exists"` outputs "exists"
    - `grep "PaymentPanel" frontend/components/payment/payment-panel.tsx` shows the export
    - `grep "PaymentPanel" frontend/components/session/session-page-client.tsx` shows the import and usage
    - `grep "payment=success" frontend/components/payment/payment-panel.tsx` shows the return-from-Stripe handling
    - `grep "payment=cancelled" frontend/components/payment/payment-panel.tsx` shows the cancelled handling
    - `grep "devBypass\|Dev Mode" frontend/components/payment/payment-panel.tsx` shows the dev bypass UI
    - `grep "isPaid" frontend/components/payment/payment-panel.tsx` shows the paid state check
    - `cd frontend && npm run type-check` passes
    - `cd frontend && npm run lint` passes
  </acceptance_criteria>
</task>

<task id="4.4.3" type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Complete payment flow: PaymentPanel component in PAYMENT phase, Stripe redirect, success/cancel return handling, dev bypass mode, Socket.io payment:completed listener for real-time transition.
  </what-built>
  <how-to-verify>
    1. Start the backend: `cd backend && npm run dev`
    2. Start the frontend: `cd frontend && npm run dev`
    3. Open the app at http://localhost:3001
    4. Create or open a session
    5. Advance the session to PAYMENT phase (via chat or direct DB update: `UPDATE renovation_sessions SET phase='PAYMENT' WHERE id='your-session-id'`)
    6. Verify the PaymentPanel appears with "Pay Now" button
    7. Click "Pay Now" — if Stripe keys are configured, you should be redirected to Stripe Checkout. If NOT configured, you should see the "Skip Payment (Dev Mode)" button.
    8. If using dev bypass: click "Skip Payment" and verify the session transitions to COMPLETE phase
    9. If using Stripe: complete payment with test card 4242 4242 4242 4242, verify redirect back with success message, verify session transitions to COMPLETE

    Expected behaviors:
    - PAYMENT phase shows PaymentPanel with pricing info
    - Without Stripe keys: dev bypass flow works end-to-end
    - With Stripe keys: redirect to Stripe hosted checkout works
    - After payment (or dev bypass): session phase shows COMPLETE
    - Payment cancelled: shows yellow cancellation message with option to retry
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
```bash
cd frontend

# Type check
npm run type-check

# Lint
npm run lint

# Verify new files exist
test -f hooks/usePayment.ts && echo "usePayment exists"
test -f components/payment/payment-panel.tsx && echo "PaymentPanel exists"

# Verify Socket.io listener added
grep "payment:completed" hooks/useSocketQuerySync.ts

# Verify integration in session page
grep "PaymentPanel" components/session/session-page-client.tsx
```
</verification>

<success_criteria>
- `useCreateCheckout` and `useDevComplete` hooks export from `usePayment.ts`
- `PaymentPanel` renders: Pay Now button (normal), Skip Payment (dev bypass), spinner (success return), cancelled message
- `useSocketQuerySync` listens for `payment:completed` and `payment:failed`, invalidating session query
- Session page shows PaymentPanel during PAYMENT phase
- `isPaid` is available on the frontend session object
- TypeScript and lint pass cleanly in frontend
- Human verification confirms end-to-end flow works
</success_criteria>

<output>
After completion, create `.planning/phases/phase-4-payment/4-04-SUMMARY.md`
</output>
