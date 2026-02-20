# Env Var Audit Checklist

Complete cross-reference of every env var as of **2026-02-21**.

Legend:
- ✅ Present (uncommented)
- ✅💬 Present (commented — correct for optional vars)
- ❌ Missing — drift detected
- — Not applicable

---

## Backend Variables (`backend/src/config/env.ts`)

| Variable | Required? | Default | `.env.example` | CI (inline stub) | CI (secret) | `isXxxEnabled()` guard |
|----------|-----------|---------|----------------|-----------------|-------------|------------------------|
| `NODE_ENV` | defaulted | `development` | ✅ | ✅ `test` | — | — |
| `PORT` | defaulted | `3000` | ✅ | — | — | — |
| `FRONTEND_URL` | defaulted | `http://localhost:3001` | ✅ | — | — | — |
| `DATABASE_URL` | **REQUIRED** | — | ✅ | ✅ `postgresql://test:test@...` | ✅ `DATABASE_URL` (backend-deploy migrations) | — |
| `GOOGLE_API_KEY` | **REQUIRED** | — | ✅ | ✅ `test-key` | ✅ `GOOGLE_API_KEY_TEST` (quality-gates E2E) | — |
| `LOG_LEVEL` | defaulted | `info` | ✅ | — | — | — |
| `LANGGRAPH_CHECKPOINTER` | defaulted | `memory` | ✅ | — | — | `isPostgresCheckpointerEnabled()` |
| `SUPABASE_URL` | optional (Phase 8) | — | ✅💬 | — | ❌ not provisioned | `isAuthEnabled()` |
| `SUPABASE_ANON_KEY` | optional (Phase 8) | — | ✅💬 | — | ❌ not provisioned | `isAuthEnabled()` |
| `SUPABASE_SERVICE_ROLE_KEY` | optional (Phase 8) | — | ✅💬 | — | ❌ not provisioned | `isAuthEnabled()` |
| `SUPABASE_STORAGE_BUCKET` | defaulted | `room-assets` | ✅💬 | — | — | `isStorageEnabled()` |
| `SUPABASE_STYLE_BUCKET` | defaulted | `style-assets` | ✅💬 | — | — | `isStorageEnabled()` |
| `REDIS_URL` | defaulted | `redis://localhost:6379` | ✅ | — | — | — |
| `SENTRY_DSN` | optional | — | ✅💬 | — | ❌ not provisioned | — |
| `SENTRY_ENVIRONMENT` | optional | — | ✅💬 | — | — | — |
| `RESEND_API_KEY` | optional | — | ✅💬 | — | ❌ not provisioned | `isEmailEnabled()` |
| `FROM_EMAIL` | defaulted | `Renovation Agent <noreply@...>` | ✅💬 | — | — | — |
| `OTEL_ENABLED` | defaulted | `true` | ✅ | — | — | `isTelemetryEnabled()` |
| `OTEL_SERVICE_NAME` | defaulted | `renovation-agent-backend` | ✅ | — | — | — |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | optional | — | ✅💬 | — | ❌ not provisioned | — |
| `OTEL_EXPORTER_OTLP_HEADERS` | optional | — | ✅💬 | — | — | — |
| `OTEL_TRACES_SAMPLER_ARG` | defaulted | `0.1` | ✅ | — | — | — |
| `OTEL_LOG_LEVEL` | defaulted | `info` | ✅ | — | — | — |
| `PUPPETEER_EXECUTABLE_PATH` | optional | — | **❌ MISSING** | — | — | `isPdfEnabled()` |
| `PDF_GENERATION_ENABLED` | defaulted | `true` | **❌ MISSING** | — | — | `isPdfEnabled()` |
| `IMAGE_GENERATION_PROVIDER` | defaulted | `gemini` | **❌ MISSING** | — | — | `isImageGenerationEnabled()` |
| `STABILITY_API_KEY` | optional | — | **❌ MISSING** | — | — | `isImageGenerationEnabled()` |
| `STRIPE_SECRET_KEY` | optional (Phase 9) | — | ✅💬 | — | ❌ not provisioned | `isPaymentsEnabled()` |
| `STRIPE_WEBHOOK_SECRET` | optional (Phase 9) | — | ✅💬 | — | ❌ not provisioned | `isPaymentsEnabled()` |

**Total**: 29 backend vars | **Drift**: 4 vars missing from `backend/.env.example`

---

## Frontend Variables

Frontend vars are `NEXT_PUBLIC_*` — set at Next.js **build time**, not validated by `env.ts`.

| Variable | Source | `frontend/.env.example` | CI (inline stub) | CI (secret) | Required to build? |
|----------|--------|------------------------|-----------------|-------------|-------------------|
| `NEXT_PUBLIC_API_URL` | Manual | ✅ | — | — | Yes (runtime) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard | ✅💬 | ✅ `https://placeholder.supabase.co` | — | No (optional) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard | ✅💬 | ✅ `placeholder-key` | — | No (optional) |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry dashboard | ✅💬 | — | — | No |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Config | ✅💬 | — | — | No |

**Total**: 5 frontend vars | **Drift**: none

---

## CI Secrets Inventory

Secrets that must be provisioned in **GitHub Repo → Settings → Secrets → Actions**:

| Secret Name | Used In | Job | What It's For | Status |
|-------------|---------|-----|---------------|--------|
| `DATABASE_URL` | `backend-deploy.yml` | `run-migrations` | Prod DB connection for Drizzle migrations | Must provision for deploy |
| `GOOGLE_API_KEY_TEST` | `quality-gates.yml` | `e2e-tests` | Gemini API key for E2E test prompts | Must provision for CI |
| `GITHUB_TOKEN` | `backend-deploy.yml` | `build-and-push` | GHCR push access — **auto-provided** | Auto |

**Future secrets** (provision when activating):
| Secret Name | Needed When | Env Var It Maps To |
|-------------|-------------|-------------------|
| `SUPABASE_URL` | Phase 8 | `SUPABASE_URL` |
| `SUPABASE_ANON_KEY` | Phase 8 | `SUPABASE_ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | Phase 8 | `SUPABASE_SERVICE_ROLE_KEY` |
| `STRIPE_SECRET_KEY` | Phase 9 | `STRIPE_SECRET_KEY` |
| `STRIPE_WEBHOOK_SECRET` | Phase 9 | `STRIPE_WEBHOOK_SECRET` |
| `RESEND_API_KEY` | When email enabled | `RESEND_API_KEY` |
| `SENTRY_DSN` | When Sentry enabled | `SENTRY_DSN` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | When OTLP collector enabled | `OTEL_EXPORTER_OTLP_ENDPOINT` |
| `STABILITY_API_KEY` | When using Stability AI | `STABILITY_API_KEY` |

---

## Active Drift Summary (as of 2026-02-21)

### backend/.env.example is missing 4 vars

These 4 vars are in `env.ts` but absent from `backend/.env.example`:

```bash
# Add to backend/.env.example under the relevant section:

# --- PDF Generation (Optional) ---
PDF_GENERATION_ENABLED=true
# PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# --- AI Image Generation (Optional) ---
IMAGE_GENERATION_PROVIDER=gemini      # gemini | stability
# STABILITY_API_KEY=sk-your-key
```

See [fix-patterns.md](./fix-patterns.md) for the exact edit to apply.

---

## How to Keep This Fresh

After any PR that modifies `env.ts`, update this checklist:
1. Add/remove rows to match new vars
2. Update drift counts
3. Add any new CI secrets to the inventory
4. Bump the "as of" date at the top
