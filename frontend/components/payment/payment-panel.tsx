'use client';

import { useState } from 'react';
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
      <Card data-testid="payment-panel" className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="text-2xl mb-2 text-green-600 dark:text-green-400">✓</div>
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
      <Card data-testid="payment-panel">
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
    try {
      const result = await createCheckout.mutateAsync();
      if (result.devBypass) {
        setIsDevBypass(true);
      } else if (result.url) {
        window.location.href = result.url;
      }
    } catch (_error) {
      // Error is handled by the mutation hook state
    }
  };

  const handleDevComplete = async () => {
    try {
      await devComplete.mutateAsync();
      // The payment:completed Socket.io event will invalidate the session query
      // and the component will re-render with isPaid=true
    } catch (_error) {
      // Error is handled by the mutation hook state
    }
  };

  return (
    <Card data-testid="payment-panel">
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
