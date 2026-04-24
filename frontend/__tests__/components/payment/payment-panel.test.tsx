import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentPanel } from '@/components/payment/payment-panel';
import { useCreateCheckout, useDevComplete } from '@/hooks/usePayment';
import { useSearchParams } from 'next/navigation';

// Mock dependencies
vi.mock('@/hooks/usePayment', () => ({
  useCreateCheckout: vi.fn(),
  useDevComplete: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
}));

// Mock window.location
const originalLocation = window.location;

describe('PaymentPanel', () => {
  const sessionId = 'test-session-id';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as unknown as ReturnType<typeof useSearchParams>);
  });

  it('renders "Pay Now" button when not paid', () => {
    vi.mocked(useCreateCheckout).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useCreateCheckout>);
    vi.mocked(useDevComplete).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useDevComplete>);

    render(<PaymentPanel sessionId={sessionId} isPaid={false} />);

    expect(screen.getByText('Pay Now')).toBeDefined();
    expect(screen.getByText('Complete Your Renovation Plan')).toBeDefined();
  });

  it('renders "Payment complete!" when isPaid is true', () => {
    render(<PaymentPanel sessionId={sessionId} isPaid={true} />);

    expect(screen.getByText('Payment complete!')).toBeDefined();
    expect(screen.getByText('Your renovation plan is ready.')).toBeDefined();
  });

  it('renders "Completing payment..." when returning from Stripe success', () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('payment=success') as unknown as ReturnType<typeof useSearchParams>);
    
    render(<PaymentPanel sessionId={sessionId} isPaid={false} />);

    expect(screen.getByText('Completing payment...')).toBeDefined();
  });

  it('shows dev bypass UI when useCreateCheckout returns devBypass: true', async () => {
    const mockMutateAsync = vi.fn().mockResolvedValue({ devBypass: true });
    vi.mocked(useCreateCheckout).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useCreateCheckout>);
    vi.mocked(useDevComplete).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useDevComplete>);

    render(<PaymentPanel sessionId={sessionId} isPaid={false} />);

    const payNowBtn = screen.getByText('Pay Now');
    fireEvent.click(payNowBtn);

    await waitFor(() => {
      expect(screen.getByText('Skip Payment (Dev Mode)')).toBeDefined();
    });
  });

  it('redirects to Stripe when useCreateCheckout returns a URL', async () => {
    // Mock window.location
    const mockLocation = { ...originalLocation, href: '' };
    // @ts-expect-error - mocking window.location
    delete window.location;
    window.location = mockLocation as unknown as Location & string;

    const mockMutateAsync = vi.fn().mockResolvedValue({ url: 'https://stripe.com/checkout' });
    vi.mocked(useCreateCheckout).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useCreateCheckout>);
    vi.mocked(useDevComplete).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useDevComplete>);

    render(<PaymentPanel sessionId={sessionId} isPaid={false} />);

    const payNowBtn = screen.getByText('Pay Now');
    fireEvent.click(payNowBtn);

    await waitFor(() => {
      expect(window.location.href).toBe('https://stripe.com/checkout');
    });

    // Restore window.location
    // @ts-expect-error - restoring window.location
    delete window.location;
    window.location = originalLocation as Location & string;
  });

  it('shows cancellation message when returning from cancelled payment', () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('payment=cancelled') as unknown as ReturnType<typeof useSearchParams>);
    vi.mocked(useCreateCheckout).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useCreateCheckout>);
    vi.mocked(useDevComplete).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useDevComplete>);

    render(<PaymentPanel sessionId={sessionId} isPaid={false} />);

    expect(screen.getByText('Payment was cancelled. You can try again when you are ready.')).toBeDefined();
  });
});
