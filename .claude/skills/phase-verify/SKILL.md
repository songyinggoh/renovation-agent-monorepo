---
name: phase-verify
description: >
  Generates a phase verification report by reading Observable Truths from the phase's
  PLAN.md, running automated checks (tests, type-check, lint, file existence, wiring
  inspection), and producing a structured report with YAML front matter. Use when a phase
  implementation is complete and needs formal verification before marking done.
user-invocable: true
---

# /phase-verify

Automated phase verification for the renovation agent monorepo. Reads a phase plan's Observable Truths, verifies each against the codebase, and generates a structured verification report.

## When to Use

- Phase implementation is complete and needs formal verification
- Re-verifying a phase after gap fixes
- Auditing a previously completed phase for regressions
- Before marking a phase as done in the roadmap

## Invocation

```
/phase-verify <phase-name-or-path>
```

**Examples**:
```
/phase-verify phase-3-renders-documents
/phase-verify agent-hardening
/phase-verify .planning/phases/phase-2-images-style-products
```

## Workflow

### Step 1: Locate the Phase Plan

Search for the PLAN.md file:

```
.planning/phases/{phase-name}/PLAN.md
.planning/phases/{phase-name}/PLAN-*.md    (sub-plans)
```

Read the plan and extract:
1. **Phase Goal** — the one-sentence deliverable
2. **Observable Truths** — the success criteria table
3. **Verification Plan** — any specific test commands or manual checks

If no plan exists, ask the user to provide success criteria or point to the right file.

### Step 2: Extract Observable Truths

Observable Truths appear in the plan as:

```markdown
## Observable Truths (Success Criteria)

| # | Truth | How to Verify |
|---|-------|--------------|
| 1 | User can upload photos | API test + frontend component exists |
```

Copy these into the verification report template. Each truth becomes a row to verify.

### Step 3: Run Automated Checks

Execute these checks and record results:

**3a. Quality gates**:
```bash
cd backend && npm run prep          # lint + build
cd backend && npm run test:unit     # all tests pass
cd frontend && npm run type-check   # TypeScript
cd frontend && npm run lint         # ESLint
```

**3b. File existence**: For each file mentioned in the plan, verify it exists and is non-trivial (not empty/stub):
```
- Check file exists (Glob)
- Check line count > threshold
- Grep for TODO/FIXME/placeholder returns
```

**3c. Wiring verification**: For each critical integration point, trace the call chain:
```
From → To → Via → Status
Example: tool file → tools/index.ts → chat.service.ts → WIRED
```

**3d. Anti-pattern scan**:
```
- Grep for console.log (should use Logger)
- Grep for 'any' type annotations
- Grep for TODO/FIXME/HACK
- Grep for empty catch blocks
```

### Step 4: Verify Each Observable Truth

For each truth, apply the **three-layer protocol**:

| Level | Question | How to Check |
|---|---|---|
| **EXISTS** | Does the file/feature exist? | File path + line count |
| **SUBSTANTIVE** | Is it real code, not a stub? | Inspect for placeholders, empty functions, TODO returns |
| **WIRED** | Is it connected end-to-end? | Trace call chain from entry point to DB/API/UI |

Mark each truth as:
- **VERIFIED** — all three layers pass with evidence
- **PARTIAL** — exists but has gaps (document what's missing)
- **FAILED** — does not meet the criterion

### Step 5: Identify Human Verification Items

Flag checks that cannot be automated:
- Live API integrations (Gemini, Stripe, Supabase Storage)
- Visual UI rendering (animations, layout, responsive)
- End-to-end streaming flows
- OAuth/auth flows requiring real credentials

For each, provide:
- **Test**: What the human should do
- **Expected**: What they should see
- **Why human**: Why code inspection is insufficient

### Step 6: Generate the Report

Write the report to:
```
.planning/phases/{phase-name}/{phase-name}-VERIFICATION.md
```

Or for sub-phases:
```
.planning/verifications/{Phase_Name}_VERIFICATION.md
```

## Report Template

See [report-template.md](./report-template.md) for the full template.

```markdown
---
phase: {phase-id}
verified: {ISO 8601 timestamp}
status: passed | failed | gaps_found
score: {n/n} must-haves verified
---

# Phase N: {Name} - Verification Report

**Phase Goal:** {one-sentence deliverable}
**Verified:** {timestamp}
**Status:** PASSED | FAILED | GAPS_FOUND

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | {truth} | VERIFIED | {file:line, specific code} |

**Score:** N/N truths verified

### Required Artifacts
| Artifact | Lines | Status | Details |
|----------|-------|--------|---------|

### Key Link Verification
| From | To | Via | Status |
|------|----|----|--------|

### Anti-Patterns Found
| File | Line | Pattern | Severity |
|------|------|---------|----------|

### Human Verification Required
#### 1. {Check Name}
**Test:** {what to do}
**Expected:** {what to see}
**Why human:** {why automated is insufficient}

### Gaps Summary
{prose or "No gaps remain"}
```

### Step 7: Report Results

Present to the user:
- **Score**: N/N truths verified
- **Status**: PASSED / FAILED / GAPS_FOUND
- **Critical gaps** (if any): What needs fixing
- **Human checks** (if any): What to manually verify

## Re-Verification

When fixing gaps and re-verifying, add `re_verification` to the YAML front matter:

```yaml
re_verification:
  previous_status: gaps_found
  previous_score: 5/7
  gaps_closed:
    - "Fixed missing Socket.io sessionId in render events"
    - "Added error handling to PDF worker"
  gaps_remaining: []
  regressions: []
```

Re-run the same checks and update each truth's status. Explicitly check for **regressions** — truths that passed before but broke during gap fixes.

## Observable Truth Quality Checklist

Good truths are:
- Written from the user's perspective ("User can...", "Agent uses...", "Documents are...")
- Binary: either true or not (no "mostly true")
- Tied to specific, inspectable code paths
- Verified with concrete evidence (file:line, function name, grep output)

Bad truths:
- "Code is clean" (subjective)
- "Performance is good" (unmeasured)
- "Everything works" (not specific)

## Common Mistakes

| Mistake | Fix |
|---|---|
| Only checking file existence | Apply all 3 layers: EXISTS + SUBSTANTIVE + WIRED |
| Marking partial as verified | Be honest — PARTIAL means gaps exist |
| Skipping anti-pattern scan | Stubs and TODOs slip through; always grep |
| Not running quality gates first | Run lint + type-check + tests before truth verification |
| Forgetting human checks | Some things can't be automated — flag them explicitly |
