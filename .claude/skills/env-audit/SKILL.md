---
name: env-audit
description: >
  Cross-references backend/src/config/env.ts Zod schema, .env.example files,
  and CI workflow secrets to catch env var drift whenever new credentials are
  added. Use when adding a new env var, onboarding, or reviewing a PR that
  touches config.
user-invocable: true
---

# /env-audit

Environment variable drift detector for the renovation agent monorepo. Every env var lives in up to five places — `env.ts`, `backend/.env.example`, `frontend/.env.example`, CI workflow `env:` blocks, and GitHub Actions secrets. This skill audits all five surfaces and reports what's missing or mismatched.

## When to Use

- **Adding a new env var**: make sure all 5 surfaces are updated, not just env.ts
- **Onboarding a new developer**: verify `.env.example` is complete enough to run locally
- **PR review**: a PR that touches `env.ts` should always update `.env.example`
- **Rotating a secret**: identify every CI workflow job that injects the old secret
- **Feature flag**: confirm the flag is in `.env.example` with a safe default
- **CI failure "env var missing"**: quickly find which surface was skipped

## Invocation

```
/env-audit
/env-audit <var-name>       # audit a single variable across all surfaces
/env-audit --new <VAR_NAME> # generate the boilerplate for a new variable
```

**Examples**:
```
/env-audit
/env-audit STRIPE_SECRET_KEY
/env-audit --new SENDGRID_API_KEY
/env-audit --new OPENAI_API_KEY
```

---

## The 5 Audit Surfaces

| # | Surface | File | Purpose |
|---|---------|------|---------|
| 1 | **Zod schema** | `backend/src/config/env.ts` | Runtime validation + TypeScript types |
| 2 | **Backend example** | `backend/.env.example` | Dev onboarding reference for backend vars |
| 3 | **Frontend example** | `frontend/.env.example` | Dev onboarding reference for `NEXT_PUBLIC_*` vars |
| 4 | **CI env blocks** | `.github/workflows/*.yml` | Test/deploy values injected into jobs |
| 5 | **GitHub secrets** | Repo Settings → Secrets | Real credentials for prod/E2E (not in files) |

A var is **drifted** when it appears in `env.ts` but is absent from one or more surfaces where it should be.

---

## Step-by-Step Audit Workflow

### 1. Read env.ts to build the canonical list

```bash
cat backend/src/config/env.ts
```

Extract every key in the Zod object schema. Classify each as:
- `REQUIRED` — no `.optional()` and no `.default()`
- `DEFAULTED` — has `.default(value)`
- `OPTIONAL` — `.optional()` with no default (feature-gated)

### 2. Compare against backend/.env.example

For every var in `env.ts`, check if `backend/.env.example` has an entry:
- Required vars: must appear uncommented
- Defaulted vars: should appear with the default value (uncommented or commented)
- Optional vars: should appear commented out (so devs know the var exists)

**Known current drift** (as of 2026-02-21) — see [audit-checklist.md](./audit-checklist.md):
- `PDF_GENERATION_ENABLED` — missing from .env.example
- `IMAGE_GENERATION_PROVIDER` — missing from .env.example
- `STABILITY_API_KEY` — missing from .env.example
- `PUPPETEER_EXECUTABLE_PATH` — missing from .env.example

### 3. Compare frontend vars against frontend/.env.example

Frontend uses only `NEXT_PUBLIC_*` vars (set by Next.js at build time). Check `frontend/.env.example` has all 5 expected vars:

```
NEXT_PUBLIC_API_URL          # required — backend URL
NEXT_PUBLIC_SUPABASE_URL     # optional — Phase 8
NEXT_PUBLIC_SUPABASE_ANON_KEY # optional — Phase 8
NEXT_PUBLIC_SENTRY_DSN       # optional — error tracking
NEXT_PUBLIC_SENTRY_ENVIRONMENT # optional — error tracking
```

### 4. Scan CI workflow files for env var usage

Read all workflow files and catalog:
- Inline values (`env:` blocks with hardcoded values) — these are safe stubs for tests
- Secret references (`${{ secrets.VAR_NAME }}`) — these must be provisioned in GitHub repo settings

**Current CI secrets in use**:
```yaml
# backend-deploy.yml  (run-migrations job)
DATABASE_URL: ${{ secrets.DATABASE_URL }}

# quality-gates.yml  (e2e-tests job)
GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY_TEST }}
```

**CI hardcoded stubs** (safe, not real secrets):
```yaml
# backend-deploy.yml + quality-gates.yml  (unit tests)
DATABASE_URL: postgresql://test:test@localhost:5432/test
GOOGLE_API_KEY: test-key

# frontend-deploy.yml + quality-gates.yml  (build check)
NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder-key
```

### 5. Cross-reference: does every secret-gated var have a CI secret?

For each `REQUIRED` or feature-enabling var, verify:

| Var | Needs CI secret? | Secret name | Workflows |
|-----|-----------------|-------------|-----------|
| `DATABASE_URL` | Yes (prod migrations) | `DATABASE_URL` | `backend-deploy.yml` |
| `GOOGLE_API_KEY` | Yes (E2E tests) | `GOOGLE_API_KEY_TEST` | `quality-gates.yml` |
| `SUPABASE_*` keys | Not yet (Phase 8) | Not provisioned | — |
| `STRIPE_*` keys | Not yet (Phase 9) | Not provisioned | — |
| `RESEND_API_KEY` | Not yet | Not provisioned | — |
| `SENTRY_DSN` | Not yet | Not provisioned | — |

### 6. Report findings

Output a table with:
- PASS ✅ — var present in all expected surfaces
- DRIFT ⚠️ — var missing from one or more surfaces
- ACTION REQUIRED 🔴 — required var missing from a critical surface (CI or .env.example)

---

## Adding a New Env Var (Checklist)

When adding any new var, touch all 5 surfaces:

```
[ ] 1. Add Zod field to env.ts (with .optional(), .default(), or required)
[ ] 2. Add to backend/.env.example with comment explaining purpose
[ ]    - Required vars: uncommented with example value
[ ]    - Optional vars: commented out with # prefix
[ ] 3. If NEXT_PUBLIC_*: add to frontend/.env.example
[ ] 4. If needed in CI tests: add to relevant workflow env: blocks
[ ] 5. If a real secret: add to GitHub repo Settings → Secrets → Actions
[ ]    (also document the secret name in this file's CI secrets table)
```

See [fix-patterns.md](./fix-patterns.md) for the exact code snippets for each surface.

---

## Quick Reference

| Pattern | Example |
|---------|---------|
| Required backend var | `MY_KEY: z.string().min(1, 'MY_KEY is required')` |
| Optional backend var | `MY_KEY: z.string().optional()` |
| Defaulted backend var | `MY_KEY: z.string().default('value')` |
| Boolean feature flag | `MY_FLAG: z.enum(['true','false']).default('false').transform(v => v === 'true')` |
| Frontend var | `NEXT_PUBLIC_MY_VAR: z.string().optional()` (not in env.ts — Next.js handles it) |
| Helper function | `export function isMyFeatureEnabled(): boolean { return !!env.MY_KEY; }` |

## Companion Files

- [audit-checklist.md](./audit-checklist.md) — Complete cross-reference table of all vars across all surfaces
- [fix-patterns.md](./fix-patterns.md) — Code snippets for fixing each type of drift
