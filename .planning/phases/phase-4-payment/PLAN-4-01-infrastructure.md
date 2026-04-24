---
plan: "4.1"
wave: 1
depends_on: []
title: "Infrastructure: Stripe SDK, env schema, shared types, config singleton"
files_modified:
  - backend/package.json
  - backend/src/config/env.ts
  - backend/src/config/stripe.ts
  - packages/shared-types/src/socket-events.ts
  - packages/shared-types/src/index.ts
  - backend/.env.example
autonomous: true
must_haves:
  truths:
    - "stripe package is installed in backend"
    - "STRIPE_PRICE_AMOUNT_CENTS env var exists with default 4900"
    - "FRONTEND_URL env var exists (already present, verify)"
    - "getStripe() returns a lazy-initialized Stripe client guarded by isPaymentsEnabled()"
    - "PaymentCompletedPayload and PaymentFailedPayload types exist in shared-types"
    - "payment:completed and payment:failed events exist on ServerToClientEvents"
  artifacts:
    - path: "backend/src/config/stripe.ts"
      provides: "getStripe() lazy singleton"
      exports: ["getStripe"]
    - path: "packages/shared-types/src/socket-events.ts"
      provides: "PaymentCompletedPayload, PaymentFailedPayload, ServerToClientEvents entries"
      contains: "PaymentCompletedPayload"
    - path: "backend/src/config/env.ts"
      provides: "STRIPE_PRICE_AMOUNT_CENTS env var"
      contains: "STRIPE_PRICE_AMOUNT_CENTS"
  key_links:
    - from: "backend/src/config/stripe.ts"
      to: "backend/src/config/env.ts"
      via: "isPaymentsEnabled() guard + env.STRIPE_SECRET_KEY"
      pattern: "import.*isPaymentsEnabled.*env"
    - from: "packages/shared-types/src/index.ts"
      to: "packages/shared-types/src/socket-events.ts"
      via: "barrel re-export of payment event types"
      pattern: "PaymentCompletedPayload"
---

<objective>
Install the Stripe SDK, extend the env schema with the price amount variable, create the lazy-initialized Stripe client singleton, and add payment Socket.io event types to shared-types.

Purpose: Every subsequent Phase 4 plan depends on these foundations -- the Stripe client, env vars, and type contracts. Without them, nothing can compile.

Output: `stripe` in backend dependencies, `stripe.ts` config file, updated env schema, updated shared-types with payment events.
</objective>

<context>
@backend/src/config/env.ts
@backend/src/config/redis.ts (lazy singleton pattern reference)
@packages/shared-types/src/socket-events.ts
@packages/shared-types/src/index.ts
@backend/.env.example
@.planning/phases/phase-4-payment/RESEARCH.md (Pattern 1: Stripe Client Initialization)
</context>

<tasks>

<task id="4.1.1" title="Install stripe SDK and add STRIPE_PRICE_AMOUNT_CENTS to env schema">
  <read_first>
    - backend/package.json -- current dependencies
    - backend/src/config/env.ts -- existing Stripe env vars (lines 148-152), isPaymentsEnabled()
    - backend/.env.example -- current Stripe section
  </read_first>
  <action>
    **1. Install the stripe package:**

    ```bash
    cd backend && pnpm add stripe
    ```

    Verify the installed version is ^20.x (latest). If pnpm is not available at root, use `pnpm --filter backend add stripe` from the repo root.

    **2. Add `STRIPE_PRICE_AMOUNT_CENTS` to `backend/src/config/env.ts`:**

    In the "Stripe Payment Integration" section (currently lines 148-152), add a new field after `STRIPE_WEBHOOK_SECRET`:

    ```typescript
    // ============================================
    // Stripe Payment Integration (OPTIONAL - Phase 4)
    // ============================================
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_AMOUNT_CENTS: z.coerce.number().int().positive().default(4900),
    ```

    Also update the comment from "Phase 9" to "Phase 4" since we are implementing payments now.

    Update the `loadEnv()` log output to include `hasStripeWebhookSecret`:
    ```typescript
    hasStripeKey: !!env.STRIPE_SECRET_KEY,
    hasStripeWebhookSecret: !!env.STRIPE_WEBHOOK_SECRET,
    ```

    And update the warn message from "optional for Phases 1-7" to "optional for Phases 1-3":
    ```typescript
    if (!env.STRIPE_SECRET_KEY) {
      logger.warn('Stripe payment integration not configured (optional for Phases 1-3)');
    }
    ```

    **3. Update `backend/.env.example`:**

    Update the Stripe section comment from "Phase 9" to "Phase 4" and add the new var:

    ```
    # --- Stripe (Optional - Phase 4) ---
    # STRIPE_SECRET_KEY=sk_test_your-key
    # STRIPE_WEBHOOK_SECRET=whsec_your-secret
    # STRIPE_PRICE_AMOUNT_CENTS=4900
    ```

    **4. Update `backend/src/db/schema/sessions.schema.ts`:**

    Update the comment and add `.unique()` to `stripePaymentIntentId` (SECURITY-CHECKLIST D4 MUST-HAVE):
    ```typescript
    // Payment fields (Phase 4)
    isPaid: boolean('is_paid').default(false),
    stripePaymentIntentId: text('stripe_payment_intent_id').unique(),
    ```

    PostgreSQL allows multiple NULLs in unique columns, so all existing unpaid sessions are unaffected.

    **5. Generate and apply Drizzle migration:**

    ```bash
    cd backend
    npm run db:generate   # produces 0009_*.sql with UNIQUE constraint
    npm run db:migrate    # applies it
    ```

    Verify the migration was created:
    ```bash
    ls backend/drizzle/0009_*.sql
    ```
  </action>
  <acceptance_criteria>
    - `grep "stripe" backend/package.json` shows stripe in dependencies
    - `grep "STRIPE_PRICE_AMOUNT_CENTS" backend/src/config/env.ts` shows the Zod field
    - `grep "STRIPE_PRICE_AMOUNT_CENTS" backend/.env.example` shows the documented var
    - `grep "Phase 4" backend/src/config/env.ts` shows the updated comment
    - `grep "Phase 4" backend/src/db/schema/sessions.schema.ts` shows the updated comment
    - `grep ".unique()" backend/src/db/schema/sessions.schema.ts` shows the unique constraint on stripePaymentIntentId
    - `ls backend/drizzle/0009_*.sql` shows the migration was generated
    - `cd backend && npx tsc --noEmit` passes
  </acceptance_criteria>
</task>

<task id="4.1.2" title="Create stripe.ts config singleton and add payment Socket.io event types">
  <read_first>
    - backend/src/config/env.ts -- isPaymentsEnabled() helper (line 236-238)
    - backend/src/config/redis.ts -- lazy singleton pattern to follow
    - packages/shared-types/src/socket-events.ts -- existing event interfaces and ServerToClientEvents
    - packages/shared-types/src/index.ts -- barrel exports
    - .planning/phases/phase-4-payment/RESEARCH.md -- Pattern 1 (Stripe Client) and Pattern 6 (Socket Events)
  </read_first>
  <action>
    **1. Create `backend/src/config/stripe.ts`:**

    ```typescript
    import Stripe from 'stripe';
    import { env, isPaymentsEnabled } from './env.js';
    import { Logger } from '../utils/logger.js';

    const logger = new Logger({ serviceName: 'StripeConfig' });

    let _stripe: Stripe | null = null;

    /**
     * Get the lazy-initialized Stripe client.
     *
     * Throws if Stripe keys are not configured. Guard with
     * isPaymentsEnabled() before calling in optional-payment codepaths.
     */
    export function getStripe(): Stripe {
      if (!_stripe) {
        if (!isPaymentsEnabled()) {
          throw new Error(
            'Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in your environment.'
          );
        }
        if (!env.STRIPE_SECRET_KEY) {
          throw new Error('STRIPE_SECRET_KEY is required when payments are enabled');
        }
        _stripe = new Stripe(env.STRIPE_SECRET_KEY);
        logger.info('Stripe client initialized');
      }
      return _stripe;
    }
    ```

    Key points:
    - Do NOT pass `apiVersion` — stripe-node v20 pins it automatically.
    - ESM import: `import Stripe from 'stripe'` (default export).
    - Explicit null-check on `env.STRIPE_SECRET_KEY` before use (no `!` non-null assertion on payment secrets -- see SECURITY-CHECKLIST K3).
    - Lazy singleton matches `getStripe()` / `getSocketServer()` pattern used throughout the codebase.

    **2. Add payment event types to `packages/shared-types/src/socket-events.ts`:**

    Add these interfaces before the `ClientToServerEvents` interface:

    ```typescript
    export interface PaymentCompletedPayload {
      sessionId: string;
    }

    export interface PaymentFailedPayload {
      sessionId: string;
      reason?: string;
    }
    ```

    Add these entries to the `ServerToClientEvents` interface:

    ```typescript
    'payment:completed': (data: PaymentCompletedPayload) => void;
    'payment:failed': (data: PaymentFailedPayload) => void;
    ```

    **3. Update `packages/shared-types/src/index.ts` barrel exports:**

    Add the new types to the existing socket-events re-export block:

    ```typescript
    export {
      // ... existing exports ...
      type PaymentCompletedPayload,
      type PaymentFailedPayload,
      // ... rest of existing exports ...
    } from './socket-events.js';
    ```

    **4. Verify type compilation across packages:**

    ```bash
    cd packages/shared-types && npx tsc --noEmit
    cd ../../backend && npx tsc --noEmit
    cd ../frontend && npx tsc --noEmit
    ```

    All three must pass.
  </action>
  <acceptance_criteria>
    - `cat backend/src/config/stripe.ts` exists with getStripe() export
    - `grep "getStripe" backend/src/config/stripe.ts` shows the function
    - `grep "PaymentCompletedPayload" packages/shared-types/src/socket-events.ts` shows the interface
    - `grep "PaymentFailedPayload" packages/shared-types/src/socket-events.ts` shows the interface
    - `grep "payment:completed" packages/shared-types/src/socket-events.ts` shows the ServerToClientEvents entry
    - `grep "PaymentCompletedPayload" packages/shared-types/src/index.ts` shows the barrel export
    - `cd backend && npx tsc --noEmit` passes
    - `cd frontend && npx tsc --noEmit` passes (or `npm run type-check`)
  </acceptance_criteria>
</task>

</tasks>

<verification>
```bash
# Stripe SDK installed
grep '"stripe"' backend/package.json

# Env schema updated
grep "STRIPE_PRICE_AMOUNT_CENTS" backend/src/config/env.ts

# Config singleton created
test -f backend/src/config/stripe.ts && echo "stripe.ts exists"

# Shared types have payment events
grep "PaymentCompletedPayload" packages/shared-types/src/socket-events.ts
grep "payment:completed" packages/shared-types/src/socket-events.ts

# Type-check all packages
cd backend && npx tsc --noEmit
cd ../frontend && npm run type-check
```
</verification>

<success_criteria>
- `stripe` ^20.x in backend/package.json dependencies
- `STRIPE_PRICE_AMOUNT_CENTS` in env schema with default 4900
- `backend/src/config/stripe.ts` exports `getStripe()` with lazy init and isPaymentsEnabled() guard
- `PaymentCompletedPayload` and `PaymentFailedPayload` in shared-types socket-events
- `payment:completed` and `payment:failed` in ServerToClientEvents
- Barrel exports updated in shared-types index.ts
- TypeScript compiles cleanly in backend and frontend
</success_criteria>

<output>
After completion, create `.planning/phases/phase-4-payment/4-01-SUMMARY.md`
</output>
