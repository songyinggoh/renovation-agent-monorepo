import { Router } from 'express';
import {
  handleCreateCheckout,
  handleGetPaymentStatus,
} from '../controllers/payment.controller.js';
import { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { verifySessionOwnership } from '../middleware/ownership.middleware.js';
import { checkoutLimiter } from '../middleware/rate-limit.middleware.js';

const router = Router();

// ============================================
// POST /api/payments/checkout/:sessionId
//
// Creates a Stripe Checkout Session and returns the redirect URL.
//
// Middleware chain:
//   optionalAuthMiddleware  — extracts req.user when Supabase auth is enabled (Phase 8+ ready)
//   verifySessionOwnership  — ensures the caller owns the session (SECURITY-CHECKLIST E4, S4)
//   handleCreateCheckout    — phase gate (E5) + Stripe session creation
//
// NOTE: The Stripe webhook route (POST /api/webhooks/stripe) is NOT in this router.
//   It is mounted directly in app.ts with express.raw() BEFORE express.json() (SECURITY-CHECKLIST W2).
//
// NOTE: The dev-complete route (POST /api/payments/dev-complete/:sessionId) is NOT in this router.
//   It is mounted conditionally inside if (env.NODE_ENV !== 'production') in app.ts (SECURITY-CHECKLIST B1).
//
// NOTE: This router also does NOT use CSRF protection — if CSRF middleware is ever added globally,
//   the webhook route in app.ts must remain exempt (SECURITY-CHECKLIST E3).
// ============================================
router.post(
  '/payments/checkout/:sessionId',
  checkoutLimiter,
  optionalAuthMiddleware,
  verifySessionOwnership,
  handleCreateCheckout
);

// ============================================
// GET /api/payments/status/:sessionId
//
// Returns current isPaid + phase for a session.
//
// Middleware chain:
//   optionalAuthMiddleware  — extracts req.user when auth is enabled
//   verifySessionOwnership  — ensures caller owns the session
//   handleGetPaymentStatus  — queries and returns { isPaid, phase }
// ============================================
router.get(
  '/payments/status/:sessionId',
  optionalAuthMiddleware,
  verifySessionOwnership,
  handleGetPaymentStatus
);

export default router;
