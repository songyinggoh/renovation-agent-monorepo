# Stripe Checkout Payment Integration — Security Checklist

**Audited:** 2026-03-19
**Auditor:** Security audit pass against codebase at commit `4fd6ceb`
**Scope:** Express.js backend (ESM), PostgreSQL/Drizzle ORM, Socket.io, Supabase Auth
**Payment model:** Stripe Checkout hosted redirect, webhook fulfillment at `POST /api/webhooks/stripe`

---

## How to Read This Document

Items are marked **MUST-HAVE** (blocking — do not ship without) or **SHOULD-HAVE** (important but not a hard blocker for initial release). Every item includes a "codebase note" that maps it directly to the files that need to change.

---

## 1. PCI DSS Scope

### What our obligation actually is

Because we use Stripe Checkout hosted redirect, all cardholder data — card number, expiry, CVV — is entered on a Stripe-owned page at `checkout.stripe.com`. Our servers never receive, transmit, or store cardholder data. This places us in **SAQ A** (Self-Assessment Questionnaire A), the lightest possible PCI compliance tier.

SAQ A requirements that apply to us:
- Maintain a patch management process for all in-scope systems.
- Protect all stored data (our `stripePaymentIntentId` is a safe, non-sensitive reference ID — not a PAN).
- Implement access controls on the backend server.
- Use TLS 1.2+ for all API calls to Stripe (the SDK handles this automatically).

### MUST-HAVE

| # | Requirement | Codebase note |
|---|-------------|---------------|
| P1 | Never accept card numbers, CVVs, or full PANs in any HTTP endpoint body, query string, or log. | No current endpoint accepts card data. Enforce this at code review. |
| P2 | Never store `stripePaymentIntentId` in logs at the INFO level — only in the structured DB record. Log only the Stripe Checkout Session ID (`cs_...`) for traceability. | See §4 (Data Handling) for exact log-safe fields. |
| P3 | Never implement a custom payment form. All card input must stay on the Stripe-hosted page. | Currently no frontend card form exists. Keep it that way. |
| P4 | Ensure TLS 1.2+ is enforced end-to-end. The Stripe Node SDK does this automatically; verify the reverse proxy / Vercel / hosting layer also enforces it. | Not a code change — deployment configuration check. |

### SHOULD-HAVE

| # | Requirement | Codebase note |
|---|-------------|---------------|
| P5 | Document the SAQ A self-assessment annually and store in a private Notion page or encrypted repo artifact. | Process item, not code. |
| P6 | Add a Content-Security-Policy header that includes `connect-src https://checkout.stripe.com` so browsers enforce that payment-related XHR only goes to Stripe. | `app.ts` line 57-60: Helmet CSP is disabled in dev and default in production. The production CSP needs a Stripe domain allowlist. |

---

## 2. Webhook Security

The webhook endpoint is the **authoritative payment fulfillment trigger**. Any vulnerability here directly controls whether a user can get the product for free.

### MUST-HAVE

| # | Requirement | Detail | Codebase note |
|---|-------------|--------|---------------|
| W1 | Use `stripe.webhooks.constructEvent()` — never hand-roll HMAC verification. | The SDK uses `timingSafeEqual` internally (constant-time comparison), preventing timing oracle attacks. | `RESEARCH.md` Pattern 3 shows the correct implementation. Do not deviate. |
| W2 | The webhook route MUST receive the raw `Buffer` body, not a parsed JSON object. | `express.json()` is applied globally at `app.ts` line 82 **before** route registration. The webhook route must be mounted **before** line 82 using `express.raw({ type: 'application/json' })` as inline middleware. | **Critical ordering issue already documented in RESEARCH.md Pitfall 1 and Pattern 4.** This is the single most common Stripe integration failure mode. |
| W3 | Validate the `stripe-signature` header presence before calling `constructEvent`. Return 400 if missing. | Prevents unauthenticated callers from triggering the handler body. | `RESEARCH.md` Pattern 3 shows this check. |
| W4 | Return HTTP 200 **immediately** (before `await fulfillPayment()`), then process asynchronously. | Stripe retries on non-2xx or timeout (>20s). Synchronous processing risks duplicate delivery → idempotency bug. | `RESEARCH.md` Pattern 3 and Pitfall 3. |
| W5 | Implement idempotency guard in `fulfillPayment()`: check `existing.isPaid` before executing the DB update. | Stripe can deliver the same event multiple times. Without this guard, a retry creates a second `COMPLETE` phase transition and can double-send receipts. | `RESEARCH.md` Pattern 5. The `isPaid` check must run even on concurrent requests — Drizzle does not provide row-level locking here by default. |
| W6 | Verify `payment_status !== 'unpaid'` before calling `fulfillPayment()` inside `checkout.session.completed`. | Deferred payment methods (BACS, ACH, iDEAL) fire `checkout.session.completed` before funds are actually captured. Fulfilling on `unpaid` gives free access. | `RESEARCH.md` Pattern 3 switch block. |
| W7 | Set Stripe's timestamp tolerance. `constructEvent` defaults to 300 seconds (5 minutes). Do not increase this. | Protects against replay attacks: a captured signed request is only valid for ±5 minutes from event creation. Reducing below 300s is acceptable; increasing it weakens replay protection. | The SDK default is fine. Do NOT pass a custom `tolerance` argument unless decreasing it. |
| W8 | Handle `checkout.session.async_payment_succeeded` in addition to `checkout.session.completed`. | Required for async payment methods; without it, users who pay via bank transfer are never fulfilled. | `RESEARCH.md` Pattern 3 switch block already includes this. |

### SHOULD-HAVE

| # | Requirement | Detail | Codebase note |
|---|-------------|--------|---------------|
| W9 | Add a dedicated, tighter rate limiter on `POST /api/webhooks/stripe`. | The current `apiLimiter` (100 req/15 min/IP) applies to all `/api/*` routes. Stripe's IPs should be exempt (see W10), but a 10 req/min per-IP cap on this route adds defense-in-depth. | `rate-limit.middleware.ts` — create a `webhookLimiter` and apply it in `payment.routes.ts`. |
| W10 | Consider IP allowlisting Stripe's webhook IPs as a defense-in-depth layer. | Stripe publishes its webhook IP ranges at `https://stripe.com/docs/ips`. However: (a) IPs change without notice; (b) TLS + signature verification already provides cryptographic authentication. IP allowlisting is defense-in-depth, not a primary control. Implement only if the deployment has a WAF or reverse proxy that can maintain the allowlist dynamically. | Not a code change — WAF/proxy configuration. Do not implement in Express middleware (fragile). |
| W11 | Log every webhook event type received, whether handled or not. | Enables post-incident analysis of unexpected event types. The `default` case in the switch block should log `event.type` and `event.id`. | `RESEARCH.md` Pattern 3 already logs `event.type`. Add `event.id` to that log call. |
| W12 | Store webhook event IDs in the database to enable idempotency at the event level (not just the `isPaid` field). | More robust than `isPaid` check alone — detects if the exact same event ID is replayed. Required only if high replay-attack risk is acceptable. | Schema change: add `processedWebhookEvents` table with `(eventId TEXT PRIMARY KEY, processedAt TIMESTAMP)`. Deferred to Phase 5+ hardening. |

---

## 3. Endpoint Security

### MUST-HAVE

| # | Requirement | Detail | Codebase note |
|---|-------------|--------|---------------|
| E1 | Apply a dedicated rate limiter to `POST /api/payments/checkout`. | This endpoint calls the Stripe API (external cost) and creates a DB record. Abuse at the current `apiLimiter` limit (100/15 min) can cost ~$0 in Stripe test mode but accumulates Stripe API usage. In production, limit to 5–10 requests per session or per IP per hour. | `rate-limit.middleware.ts` — create a `checkoutLimiter` (e.g. 10 points, 3600s duration). Apply per-sessionId key, not just per IP, to prevent one user from spamming multiple sessions. |
| E2 | The webhook route (`POST /api/webhooks/stripe`) MUST be exempt from CORS restrictions. | Stripe's servers do not send CORS headers. The current CORS config (`cors({ origin: env.FRONTEND_URL })`) correctly applies only to browser-originating requests — server-to-server POST requests don't use CORS. No CORS change is needed, but verify that no `cors()` middleware is ever applied to the webhook route specifically. | `app.ts` lines 70-77: CORS is global. This is fine — servers don't enforce CORS. Document this explicitly so future developers don't add `corsMiddleware` to the webhook route. |
| E3 | The webhook route MUST be exempt from CSRF protection if any CSRF middleware is ever added. | No CSRF middleware currently exists. If it is added later, the webhook route must use the `express.raw()` bypass because Stripe does not send CSRF tokens. | Document this constraint in `payment.routes.ts` with a comment. |
| E4 | `POST /api/payments/checkout` must validate that the `sessionId` belongs to the requesting user (ownership check) before creating a Stripe session. | Without this, User A can create a payment checkout for User B's session, then pay, fulfilling a session they don't own. | Apply `verifySessionOwnership` middleware (already exists in `ownership.middleware.ts`) to `POST /api/payments/checkout/:sessionId`. |
| E5 | `POST /api/payments/checkout` must verify the session is in `PAYMENT` phase before creating a Stripe Checkout Session. | Without this, a user could pay for a session still in `INTAKE` phase — paying before the deliverable is generated. | Check `session.phase === 'PAYMENT'` in the controller before calling `createCheckoutSession()`. Return 400 if not. |
| E6 | `POST /api/payments/dev-complete` must be mounted ONLY when `NODE_ENV !== 'production'`. | This endpoint directly calls `fulfillPayment()` without Stripe. If exposed in production, any caller can mark any session as paid for free. | See §5 (Dev Bypass Security) for the full enforcement pattern. |

### SHOULD-HAVE

| # | Requirement | Detail | Codebase note |
|---|-------------|--------|---------------|
| E7 | Add `optionalAuthMiddleware` to `POST /api/payments/checkout`. | When Supabase auth is enabled (Phase 8+), the checkout endpoint should bind the checkout session to the authenticated user. Pre-wiring this now means no refactor needed in Phase 8. | `payment.routes.ts` — add `optionalAuthMiddleware` to the checkout route. The RESEARCH.md Pattern already shows this. |
| E8 | Add Zod request body validation to `POST /api/payments/checkout`. | Currently the route relies on `req.params.sessionId` which is a URL segment, not a body field. However, if any body fields are added (e.g. coupon codes, custom amounts), they must be validated with a Zod schema via the existing `validate` middleware. | `backend/src/validators/payment.validators.ts` — create this file preemptively with a `createCheckoutSchema`. |
| E9 | Expose `stripeCheckoutSessionId` in the API response to the frontend but never expose `stripePaymentIntentId`. | The checkout session ID (`cs_...`) is safe to share with the frontend for status polling. The payment intent ID is an internal reference that should only exist in the DB. | `payment.controller.ts` — return `{ url, checkoutSessionId }` only. Never return `paymentIntentId`. |

---

## 4. Data Handling

### What is safe to log vs what must never appear in logs

**Safe to log (structured fields):**
```
stripeCheckoutSessionId  (cs_test_... / cs_live_...)  — safe, no cardholder data
renovationSessionId      (UUID)                        — safe, our internal ID
amount                   (integer cents)               — safe, not sensitive
currency                 (string)                      — safe
event.type               (string)                      — safe
event.id                 (evt_...)                     — safe
payment_status           (string)                      — safe
```

**NEVER log (even at DEBUG level):**
```
card number / PAN                — never touches our code, but enforce explicitly
CVV / CVC                        — same
customer.email                   (GDPR-sensitive — log hash only if needed)
stripePaymentIntentId            (pi_... — internal reference; do not log at INFO)
Stripe secret key                (sk_live_... / sk_test_...)
Stripe webhook secret            (whsec_...)
```

### MUST-HAVE

| # | Requirement | Detail | Codebase note |
|---|-------------|--------|---------------|
| D1 | `stripePaymentIntentId` must only be written to the database — never to logs. | It appears in `fulfillPayment()` in RESEARCH.md Pattern 5. The logger call there logs `paymentIntentId` — this must be removed or replaced with only `stripeSessionId`. | Change `logger.info('Payment fulfilled', { renovationSessionId, stripeSessionId: session.id, paymentIntentId })` — remove `paymentIntentId` from the log fields. Keep it in the DB write only. |
| D2 | `customer.email` from the Stripe event must not be logged unless hashed. | Stripe Checkout session objects may include `customer_details.email`. This is personal data under GDPR Article 4. | In `fulfillPayment()`, do not log `session.customer_details?.email`. If needed for debugging, log `!!session.customer_details?.email` (boolean presence only). |
| D3 | Never pass the raw Stripe event object to the logger. | `JSON.stringify(event)` would include customer details, amount, and metadata in the log stream. | Always destructure only the safe fields listed above. |
| D4 | The `stripePaymentIntentId` column in `renovation_sessions` must have a database-level unique constraint or be indexed, to prevent accidental duplicate rows. | Not a security item per se, but prevents data integrity issues where two sessions claim the same payment intent. | `sessions.schema.ts` — add `.unique()` to the `stripePaymentIntentId` column definition. |

### SHOULD-HAVE

| # | Requirement | Detail | Codebase note |
|---|-------------|--------|---------------|
| D5 | Store the Stripe Checkout Session ID (`cs_...`) in a new `stripeCheckoutSessionId` column on `renovation_sessions`. | Enables idempotency lookup: if the same checkout session fires the webhook twice, we can detect it by `stripeCheckoutSessionId` before even checking `isPaid`. Also useful for Stripe Dashboard cross-referencing. | Schema migration: add `stripeCheckoutSessionId TEXT` column. |
| D6 | Add a database migration to add a `NOT NULL` constraint to `stripePaymentIntentId` when `isPaid = true`. | Enforces at the DB level that a paid session always has a traceable payment intent. | Drizzle check constraint: `check('paid_has_intent', sql`(is_paid = false) OR (stripe_payment_intent_id IS NOT NULL)`)` |

---

## 5. Dev Bypass Security

The `POST /api/payments/dev-complete` endpoint is the highest-risk item in the entire integration. If it is reachable in production, an attacker can obtain any renovation plan package for free by simply calling it.

### MUST-HAVE

| # | Requirement | Detail | Codebase note |
|---|-------------|--------|---------------|
| B1 | Mount dev-complete ONLY inside a `NODE_ENV !== 'production'` block, identical to how Bull Board is gated in `app.ts`. | The gating must occur at **route registration** time, not inside the handler. A handler-level check (e.g. `if (env.NODE_ENV === 'production') return res.status(404)`) is insufficient — the route still exists in the routing table and can be probed. | `app.ts` lines 124-139 shows the pattern: `if (env.NODE_ENV !== 'production') { ... mount routes ... }`. Mirror this exactly. |
| B2 | Verify that the production deployment system sets `NODE_ENV=production` as a **non-overridable** environment variable. | If `NODE_ENV` can be overridden by a misconfigured `.env` file committed to the repo, the gate fails. | `env.ts` line 23: `NODE_ENV` is read from `process.env`. Ensure the Vercel / Docker production deployment explicitly sets this — do not rely on the `.env.example` default. |
| B3 | The dev-complete endpoint must still require `verifySessionOwnership` — it must not allow arbitrary session IDs. | Even in development, an anonymous caller should not be able to mark another user's session as paid. | Add `optionalAuthMiddleware` + `verifySessionOwnership` to the dev-complete route. |
| B4 | Add an integration test that asserts `POST /api/payments/dev-complete` returns 404 when `NODE_ENV === 'production'`. | This test must run in CI. It is the regression guard for this class of vulnerability. | `backend/src/__tests__/payment/dev-complete-production-guard.test.ts` — set `process.env.NODE_ENV = 'production'` before app initialization, then assert 404. |
| B5 | The dev-complete response must include a visible warning in the response body that this is a dev-only bypass. | Reduces risk of accidentally using dev-complete in a staging environment that is exposed to the internet. | Response: `{ devBypass: true, warning: 'THIS ENDPOINT DOES NOT EXIST IN PRODUCTION', sessionId }` |

### SHOULD-HAVE

| # | Requirement | Detail | Codebase note |
|---|-------------|--------|---------------|
| B6 | Add a startup log line when dev-complete is registered, clearly visible in the server boot output. | Makes it immediately obvious during dev and staging that the bypass is active. | `logger.warn('DEV BYPASS: /api/payments/dev-complete is mounted. DO NOT USE IN PRODUCTION.')` inside the `NODE_ENV !== 'production'` block in `app.ts`. |
| B7 | Consider renaming the endpoint from `/dev-complete` to a non-guessable path in staging environments. | If staging is internet-accessible, security-by-obscurity adds a small additional barrier. Not a substitute for the `NODE_ENV` gate. | `/api/payments/dev-bypass-${SOME_RANDOM_TOKEN}` — read the token from a dev-only env var. Low priority. |

---

## 6. Session Security — Protecting `isPaid`

The `isPaid` boolean on `renovation_sessions` is the payment gate. If a user can set it to `true` without paying, they get the product for free.

### MUST-HAVE

| # | Requirement | Detail | Codebase note |
|---|-------------|--------|---------------|
| S1 | No HTTP endpoint may accept `isPaid` as a request body field. | The session create and update controllers must use Zod schemas that **do not include** `isPaid`. Any field not in the schema must be silently dropped by the validator — never passed to Drizzle. | `session.validators.ts` — verify `isPaid` is absent from `createSessionSchema` and any future update schema. |
| S2 | No HTTP endpoint may accept `stripePaymentIntentId` as a request body field. | Same rationale as S1 — this field must only be written by `fulfillPayment()` from a verified webhook event. | Same file as S1. |
| S3 | `fulfillPayment()` must be the only code path that sets `isPaid = true`. | Audit every Drizzle `.update()` call that touches `renovation_sessions`. The only write path to `isPaid = true` should be inside `payment.service.ts::fulfillPayment()`. | Search `codebase for `isPaid` writes: `grep -r "isPaid.*true" backend/src`. Any match outside `payment.service.ts` is a vulnerability. |
| S4 | The `verifySessionOwnership` middleware must be applied to `POST /api/payments/checkout/:sessionId`. | Without this, User A can create a checkout for User B's session. If User A pays, User B's session gets fulfilled — which is a privacy violation (User A learns User B has a session) and potentially an abuse vector if sessions are transferable. | `ownership.middleware.ts` already implements this correctly — it must be wired to the checkout route. |
| S5 | The phase gate check (`session.phase === 'PAYMENT'`) in the chat handler must re-read `isPaid` from the database at check time, not from a cached/stale value. | If `isPaid` is cached in memory (e.g. in LangGraph state), a replay attack could use a stale `isPaid = false` value to re-enter the PAYMENT phase after paying. | The agent supervisor layer must query `db.select` for the current session state on every message in the PAYMENT phase. |

### SHOULD-HAVE

| # | Requirement | Detail | Codebase note |
|---|-------------|--------|---------------|
| S6 | Add an audit log entry whenever `isPaid` transitions from `false` to `true`. | Creates a non-repudiable record of payment fulfillment events for dispute resolution. | `fulfillPayment()` — log `{ event: 'payment_fulfilled', renovationSessionId, stripeSessionId, stripePaymentIntentId, timestamp }` at `logger.info`. The `stripePaymentIntentId` is safe to log here specifically in the audit trail (not general application logs). |
| S7 | Consider a database-level trigger or Drizzle query constraint that prevents `isPaid` from transitioning `true → false`. | If a bug or compromised code path attempts to "unpay" a session, the DB should reject it. | PostgreSQL trigger: `BEFORE UPDATE ON renovation_sessions: IF OLD.is_paid = true AND NEW.is_paid = false THEN RAISE EXCEPTION`. |

---

## 7. Secrets Management

### MUST-HAVE

| # | Requirement | Detail | Codebase note |
|---|-------------|--------|---------------|
| K1 | `STRIPE_SECRET_KEY` must NEVER appear in source code, git history, log files, or error responses. | The current `env.ts` reads it from environment variables via Zod (correct). The `loadEnv()` logger call at line 174 logs `hasStripeKey: !!env.STRIPE_SECRET_KEY` (boolean presence only) — this is correct and safe. | Confirm the same boolean-presence pattern is used everywhere. Never log the key value. |
| K2 | Use Stripe test-mode keys (`sk_test_...`, `whsec_...` from Stripe CLI) in all non-production environments. Never use live keys in development or CI. | Live keys charged real money. Test keys are functionally identical for all integration testing. | Document this in `.env.example`. |
| K3 | `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` must not be marked as optional in `env.ts` when `isPaymentsEnabled() === true`. | Currently both are `z.string().optional()` (lines 150-151). This means TypeScript will not error if they are `undefined` even inside a block where `isPaymentsEnabled()` returned `true`. The `getStripe()` function uses `env.STRIPE_SECRET_KEY!` (non-null assertion) — this is a runtime bomb. | Two options: (a) use Zod discriminated union to make both required when `NODE_ENV === 'production'`, or (b) validate in `getStripe()` with a thrown `Error` before the non-null assertion. Option (b) is already partially present. Make it explicit: `if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is required')` — never use `!` assertion on payment secrets. |
| K4 | Stripe live key rotation must be a documented runbook. | When rotating: (1) create new key in Stripe Dashboard, (2) update production env var, (3) restart service, (4) revoke old key. The old key must be revoked — not just replaced — because Stripe keys don't auto-expire. | Not a code change. Create `docs/runbooks/stripe-key-rotation.md`. |
| K5 | Stripe webhook secret must be re-generated if the webhook endpoint URL changes. | The `whsec_...` secret is bound to the registered webhook endpoint URL in Stripe Dashboard. If the endpoint URL changes (e.g. custom domain, path change), the old secret is invalid. | Document in the runbook above. |

### SHOULD-HAVE

| # | Requirement | Detail | Codebase note |
|---|-------------|--------|---------------|
| K6 | Add startup validation: if `NODE_ENV === 'production'` and `isPaymentsEnabled() === false`, emit a prominent warning (not just the existing `logger.warn`). | Prevents silent payment bypass in production if keys are accidentally missing from the deployment env. | `env.ts` `loadEnv()`: after the `if (!env.STRIPE_SECRET_KEY)` warn block, add: `if (env.NODE_ENV === 'production' && !isPaymentsEnabled()) { logger.error('CRITICAL: Stripe not configured in production — payment routes will return dev bypass mode') }` |
| K7 | Use separate Stripe API keys for staging vs production. | Stripe supports multiple restricted API keys. A staging key limited to `checkout:write` and `webhook:read` scopes cannot be used to read customer data or issue refunds if compromised. | Stripe Dashboard → Developers → API keys → Create restricted key. |
| K8 | Store secrets in a secrets manager (e.g. Vercel environment variables, AWS Secrets Manager, Doppler) rather than `.env` files on production servers. | `.env` files on disk can be read if there is a path traversal or SSRF vulnerability. Injected environment variables are process-scoped and not on disk. | Deployment configuration — not a code change. |

---

## 8. Known Gaps in the Current Codebase

These are security issues that already exist and that the payment integration must not make worse.

| # | Gap | Risk | Remediation |
|---|-----|------|-------------|
| G1 | `ownership.middleware.ts` only enforces ownership when **both** `session.userId` is set AND `req.user` is present. Anonymous sessions (userId = null) are accessible to any caller who knows the UUID. | MEDIUM: During Phases 1-7, session UUIDs are the only access control. If a session UUID is leaked (e.g. in an email, URL bar history), any unauthenticated caller can access it. For the payment phase, this means anyone with the UUID can trigger a checkout for that session. | Acceptable trade-off for Phases 1-7 per design decision. In Phase 8 (auth), ensure all payment sessions have a userId. |
| G2 | `FROM_EMAIL` defaults to `noreply@renovationagent.com` which is an unowned domain. | LOW: Email spoofing / SPF failure if email receipts are enabled. | Set a real domain with SPF/DKIM records before enabling `RESEND_API_KEY`. |
| G3 | `apiLimiter` keys on `req.ip`. With `app.set('trust proxy', 1)` and a legitimate reverse proxy, this is correct. However, if the proxy is misconfigured or absent, `req.ip` may be spoofed via `X-Forwarded-For`. | MEDIUM: An attacker on the same network as the server could forge IPs to bypass rate limiting. | Verify that the production deployment always terminates requests through a trusted reverse proxy (Vercel Edge, nginx, ALB). Do not expose the Express server directly. |

---

## 9. Implementation Order (Security-First Sequence)

When the implementation phase begins, apply security controls in this order to avoid shipping a partially-secured endpoint:

1. **Add env validation for Stripe keys** (K3) — before writing any payment code
2. **Wire webhook route before `express.json()`** (W2) — first thing in `app.ts` changes
3. **Implement `constructEvent` + raw body handler** (W1, W3, W4) — before any fulfillment logic
4. **Implement idempotency guard in `fulfillPayment()`** (W5) — before testing with Stripe CLI
5. **Gate dev-complete with `NODE_ENV` check + test** (B1, B4) — before any frontend integration
6. **Add `verifySessionOwnership` to checkout route** (E4, S4) — before any frontend integration
7. **Audit `isPaid` write paths** (S3) — before merge to main
8. **Add payment-specific rate limiter** (E1) — before production deployment
9. **Verify CSP Stripe domains** (P6) — before production deployment
10. **Write key rotation runbook** (K4) — before handing off to operations

---

## 10. Summary Counts

| Priority | Count | Items |
|----------|-------|-------|
| MUST-HAVE | 28 | P1-P4, W1-W8, E1, E3-E6, D1-D4, B1-B5, S1-S5, K1-K5 |
| SHOULD-HAVE | 19 | P5-P6, W9-W12, E7-E9, D5-D6, B6-B7, S6-S7, K6-K8 |
| Known gaps (pre-existing) | 3 | G1-G3 |

The single highest-risk item is **W2** (raw body ordering in `app.ts`) because it is invisible at runtime — the server starts normally, all other routes work, but every webhook event silently fails signature verification. The second highest-risk item is **B1** (dev-complete in production).

---

*This document is a security requirements specification, not an implementation plan. Do not begin implementation until this checklist has been reviewed and the implementation plan (PLAN-4.x-payment.md) has been approved.*
