# Fix Patterns for Env Drift

## Fix 1: Add a var to `env.ts` (Zod schema)

### Required var (no default, fails startup if missing)

```typescript
// backend/src/config/env.ts — inside envSchema z.object({ ... })

// ============================================
// My Feature (REQUIRED)
// ============================================
MY_API_KEY: z.string().min(1, 'MY_API_KEY is required'),
```

### Optional var (feature-gated, server starts without it)

```typescript
// ============================================
// My Feature (OPTIONAL - Phase N)
// ============================================
MY_API_KEY: z.string().optional(),
```

### Defaulted var (always present, has safe default)

```typescript
// ============================================
// My Feature Configuration
// ============================================
MY_PROVIDER: z
  .enum(['option-a', 'option-b'])
  .default('option-a'),
```

### Boolean feature flag (string input → boolean output)

```typescript
MY_FEATURE_ENABLED: z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true'),
```

### Add helper function (if feature-gating other code)

```typescript
// After the envSchema definition and exports:

/**
 * Helper function to check if my feature is configured
 */
export function isMyFeatureEnabled(): boolean {
  return !!env.MY_API_KEY;
}
// OR for boolean flag:
export function isMyFeatureEnabled(): boolean {
  return env.MY_FEATURE_ENABLED;
}
```

---

## Fix 2: Add a var to `backend/.env.example`

Find the correct section comment block and add the var:

### Required var (uncommented, example value)

```bash
# --- My Feature ---
MY_API_KEY=your-api-key-here
```

### Optional var (commented, shows the key exists)

```bash
# --- My Feature (Optional - Phase N) ---
# MY_API_KEY=your-api-key-here
```

### Defaulted var with enum choices (uncommented, shows default and options)

```bash
# --- My Feature ---
MY_PROVIDER=option-a                  # option-a | option-b
```

### Boolean flag with default

```bash
MY_FEATURE_ENABLED=false              # true | false
```

**Placement rules**:
- Required vars → under `# --- Required (Phases 1-7) ---` or its own section
- Optional vars → after required section, in a labeled section block
- New sections go in phase order: Supabase → Redis → Sentry → Email → OTel → PDF → Image Gen → Stripe

---

## Fix 3: Add a var to `frontend/.env.example`

Frontend vars must be prefixed `NEXT_PUBLIC_` (Next.js exposes them to the browser).

```bash
# frontend/.env.example

# --- My Feature ---
# NEXT_PUBLIC_MY_FEATURE_URL=https://api.example.com
```

**Notes**:
- Frontend vars are NOT validated by `env.ts` — Next.js injects them at build time
- Access in code: `process.env.NEXT_PUBLIC_MY_FEATURE_URL`
- Never put secrets in `NEXT_PUBLIC_*` — they are embedded in the JS bundle

---

## Fix 4: Add a var to CI workflows

### Adding an inline stub for unit tests (safe, fake value)

Edit `quality-gates.yml` and/or `backend-deploy.yml` under the `Run unit tests` step:

```yaml
- name: Run unit tests
  run: pnpm test:unit
  env:
    NODE_ENV: test
    DATABASE_URL: postgresql://test:test@localhost:5432/test
    GOOGLE_API_KEY: test-key
    MY_API_KEY: test-stub-value      # ← add here
```

### Adding a real secret for E2E tests

1. Go to GitHub Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
2. Name it (e.g., `MY_API_KEY_TEST`), paste the value, save
3. Reference it in `quality-gates.yml` E2E step:

```yaml
- name: Run E2E tests
  run: pnpm test:e2e
  env:
    DATABASE_URL: postgresql://postgres:postgres@localhost:5432/renovation_agent_test
    GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY_TEST }}
    MY_API_KEY: ${{ secrets.MY_API_KEY_TEST }}      # ← add here
    NODE_ENV: test
    PORT: 3000
```

4. Update the CI secrets table in [audit-checklist.md](./audit-checklist.md)

### Adding a real secret for production deployment

Edit `backend-deploy.yml` under the relevant deploy step:

```yaml
- name: Run Drizzle migrations
  run: pnpm db:migrate
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    MY_API_KEY: ${{ secrets.MY_API_KEY }}           # ← add here
```

---

## Fix 5: Fix the current drift (4 missing vars from backend/.env.example)

Apply this edit to `backend/.env.example` — add after the OTel section:

```bash
# --- PDF Generation (Optional) ---
PDF_GENERATION_ENABLED=true           # true | false — controls /doc route
# PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# --- AI Image Generation (Optional) ---
IMAGE_GENERATION_PROVIDER=gemini      # gemini | stability
# STABILITY_API_KEY=sk-your-stability-api-key
```

The file already has a `# --- Stripe ---` section at the bottom — insert the two new sections before it.

**Verified drift**: `PDF_GENERATION_ENABLED`, `IMAGE_GENERATION_PROVIDER`, `STABILITY_API_KEY`, `PUPPETEER_EXECUTABLE_PATH` are defined in `env.ts` but absent from `backend/.env.example`.

---

## Fix 6: Activate a Phase 8/9 feature in CI

When enabling auth (Phase 8) or payments (Phase 9), three CI steps need secrets:

### Phase 8 (Supabase auth)

1. Provision GitHub secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
2. Add to the E2E test step in `quality-gates.yml`:

```yaml
SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

3. Uncomment the vars in `backend/.env.example` (remove the `# ` prefix)
4. Update [audit-checklist.md](./audit-checklist.md) — change `❌ not provisioned` → `✅ provisioned`

### Phase 9 (Stripe payments)

1. Provision GitHub secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
2. Use test-mode keys for CI (`sk_test_...`, `whsec_...`)
3. Add to the E2E test step:

```yaml
STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
STRIPE_WEBHOOK_SECRET: ${{ secrets.STRIPE_WEBHOOK_SECRET }}
```

4. Uncomment the vars in `backend/.env.example`
5. Update [audit-checklist.md](./audit-checklist.md)

---

## Anti-Patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| Adding var to env.ts but skipping .env.example | Next dev clones repo, can't run — no hint the var exists | Always add to .env.example, commented if optional |
| Hardcoding secret in CI workflow `env:` block | Secret visible in workflow logs and git history | Use `${{ secrets.VAR_NAME }}` |
| Using `NEXT_PUBLIC_` for secrets | Embedded in JS bundle, visible to all users | Use backend API route as proxy; never expose secrets to browser |
| Adding helper `isXxxEnabled()` that reads from `process.env` directly | Bypasses Zod validation | Always read from the singleton `env` object |
| Putting required var in optional group in .env.example | Developer omits it, gets cryptic error | Put required vars in the `Required` section, uncommented |
| Not updating audit-checklist.md | Drift silently accumulates | Update checklist every time env.ts changes |
