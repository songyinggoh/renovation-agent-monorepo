---
phase: phase-4-payment
plan: "4-01"
subsystem: payments
tags: [stripe, socket-io, shared-types, zod, drizzle, env-config]

# Dependency graph
requires:
  - phase: phase-3-renders-documents
    provides: shared-types socket-events pattern, env.ts Zod schema pattern, sessions schema structure
provides:
  - stripe ^18.5.0 SDK installed in backend
  - STRIPE_PRICE_AMOUNT_CENTS env var with Zod validation and default 4900
  - backend/src/config/stripe.ts with lazy getStripe() singleton guarded by isPaymentsEnabled()
  - PaymentCompletedPayload and PaymentFailedPayload types in shared-types
  - payment:completed and payment:failed events in ServerToClientEvents
  - Unique constraint on stripePaymentIntentId (migration 0009)
affects:
  - phase-4-02 (backend core: payment service, controller, routes all import getStripe and payment payloads)
  - phase-4-03 (security hardening uses isPaymentsEnabled() from env)
  - phase-4-04 (frontend Socket.io listener uses PaymentCompletedPayload from shared-types)
  - phase-4-05 (integration tests verify all payment infrastructure)

# Tech tracking
tech-stack:
  added:
    - stripe ^18.5.0 (not ^20.x as planned — latest available on registry is v18)
  patterns:
    - Lazy singleton with null guard (getStripe matches getSocketServer/getRedis pattern)
    - isPaymentsEnabled() guard before client init (matches isAuthEnabled() pattern)
    - Explicit null-check on secret before use (no non-null assertion on credentials)
    - Payment types as Socket.io event payloads in shared-types (sessionId-based)

key-files:
  created:
    - backend/src/config/stripe.ts
    - backend/drizzle/0009_slim_spacker_dave.sql
    - backend/drizzle/meta/0009_snapshot.json
  modified:
    - backend/package.json (stripe dependency added)
    - backend/src/config/env.ts (STRIPE_PRICE_AMOUNT_CENTS, updated comments/logs)
    - backend/src/db/schema/sessions.schema.ts (.unique() on stripePaymentIntentId)
    - backend/.env.example (Phase 4 comment, STRIPE_PRICE_AMOUNT_CENTS documented)
    - packages/shared-types/src/socket-events.ts (PaymentCompletedPayload, PaymentFailedPayload, payment events)
    - packages/shared-types/src/index.ts (barrel exports for payment types)
    - pnpm-lock.yaml

key-decisions:
  - "Stripe v18.5.0 installed (plan specified ^20.x which does not exist on npm registry — v18 is current major)"
  - "No apiVersion passed to Stripe constructor — stripe-node v18+ pins it automatically"
  - "Unique constraint on stripePaymentIntentId via Drizzle migration — PostgreSQL allows multiple NULLs so existing sessions unaffected"

patterns-established:
  - "getStripe(): lazy singleton with isPaymentsEnabled() guard — throws explicit error if unconfigured"
  - "Payment Socket.io events use sessionId as minimal payload (extensible by later phases)"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-03-18
---

# Phase 4 Plan 01: Infrastructure Summary

**Stripe SDK + lazy getStripe() singleton, STRIPE_PRICE_AMOUNT_CENTS env var with Zod default 4900, PaymentCompletedPayload/PaymentFailedPayload Socket.io types, and unique DB constraint on stripePaymentIntentId**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-18T19:36:51Z
- **Completed:** 2026-03-18T19:45:14Z
- **Tasks:** 2
- **Files modified:** 9 (6 modified, 3 created)

## Accomplishments

- Stripe SDK (v18.5.0) installed and verified in backend
- Env schema extended with `STRIPE_PRICE_AMOUNT_CENTS` (z.coerce.number, default 4900), all Phase 9 references updated to Phase 4
- `getStripe()` lazy singleton in `backend/src/config/stripe.ts` with explicit isPaymentsEnabled() guard and null-check on secret
- Payment Socket.io event types (`PaymentCompletedPayload`, `PaymentFailedPayload`) added to shared-types with barrel exports
- `payment:completed` and `payment:failed` added to `ServerToClientEvents`
- Drizzle migration 0009 adding UNIQUE constraint on `stripe_payment_intent_id` column (security requirement SECURITY-CHECKLIST D4)

## Task Commits

Each task was committed atomically:

1. **Task 4.1.1: Install stripe SDK and add STRIPE_PRICE_AMOUNT_CENTS to env schema** - `e2e9fe2` (feat)
2. **Task 4.1.2: Create stripe.ts config singleton and add payment Socket.io event types** - `0df1031` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `backend/src/config/stripe.ts` - Lazy Stripe client singleton with isPaymentsEnabled() guard
- `backend/src/config/env.ts` - STRIPE_PRICE_AMOUNT_CENTS field, updated Phase comments, hasStripeWebhookSecret in log
- `backend/src/db/schema/sessions.schema.ts` - .unique() on stripePaymentIntentId, Phase 4 comment
- `backend/package.json` - stripe ^18.5.0 in dependencies
- `backend/.env.example` - Phase 4 Stripe section with STRIPE_PRICE_AMOUNT_CENTS documented
- `backend/drizzle/0009_slim_spacker_dave.sql` - UNIQUE constraint migration for stripe_payment_intent_id
- `packages/shared-types/src/socket-events.ts` - PaymentCompletedPayload, PaymentFailedPayload interfaces + ServerToClientEvents entries
- `packages/shared-types/src/index.ts` - Barrel exports for PaymentCompletedPayload, PaymentFailedPayload
- `pnpm-lock.yaml` - Updated lockfile for stripe installation

## Decisions Made

- **Stripe v18.5.0 not v20.x**: The plan specified `^20.x` but npm registry serves v18.5.0 as the current major. v18 is production-ready and pins the API version internally — same behavior as described in the plan for "v20".
- **No `apiVersion` in Stripe constructor**: stripe-node v18+ pins the API version automatically. Passing it explicitly is unnecessary and potentially restrictive.
- **Explicit null-check on STRIPE_SECRET_KEY**: Two-layer guard (`isPaymentsEnabled()` + explicit `if (!env.STRIPE_SECRET_KEY)`) rather than non-null assertion on payment credentials, per SECURITY-CHECKLIST K3.

## Deviations from Plan

None - plan executed exactly as written, except stripe v18 vs v20 (registry version difference, not a functional deviation).

## Issues Encountered

- Pre-existing TypeScript errors in `supervisor.ts` and `render.service.ts` appear in `npx tsc --noEmit` output — these are documented in STATE.md as known pre-existing issues not introduced by Phase 4 work. Verified zero errors in changed files.

## User Setup Required

None - no external service configuration required for this infrastructure plan. Stripe keys are optional; `isPaymentsEnabled()` returns false and `getStripe()` is never called until keys are set.

## Next Phase Readiness

- Phase 4-02 (backend core) can proceed: `getStripe()`, `isPaymentsEnabled()`, `STRIPE_PRICE_AMOUNT_CENTS`, and payment Socket.io types are all available
- `FRONTEND_URL` env var already present in env schema (verified during task execution)
- Database has unique constraint on `stripePaymentIntentId` — migration 0009 generated but not applied (requires live DB)
- Stripe test-mode keys needed for full E2E; dev bypass works without them

---
*Phase: phase-4-payment*
*Completed: 2026-03-18*
