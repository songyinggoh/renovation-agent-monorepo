# Verification Report Template

Copy this template and fill in each section during verification.

```markdown
---
phase: {phase-id}
verified: {YYYY-MM-DDTHH:mm:ssZ}
status: passed | failed | gaps_found
score: {n/n} must-haves verified
---

# Phase {N}: {Name} - Verification Report

**Phase Goal:** {one-sentence deliverable from PLAN.md}
**Verified:** {YYYY-MM-DD}
**Status:** PASSED | FAILED | GAPS_FOUND

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | {truth from plan} | VERIFIED / PARTIAL / FAILED | {file:line, grep output, test name} |
| 2 | {truth from plan} | VERIFIED / PARTIAL / FAILED | {evidence} |

**Score:** N/N truths verified

### Required Artifacts

| Artifact | Path | Lines | Status | Details |
|----------|------|-------|--------|---------|
| {file name} | `backend/src/...` | {count} | EXISTS / MISSING / STUB | {notes} |

### Key Link Verification

Trace critical integration chains:

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `tool.ts` | `tools/index.ts` | import + array entry | WIRED / BROKEN | {notes} |
| `tools/index.ts` | `chat.service.ts` | `renovationTools` binding | WIRED / BROKEN | {notes} |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/...` | {line} | `console.log` / `any` / `TODO` | LOW / MEDIUM / HIGH | {description} |

Or: **None found.**

### Quality Gates

| Check | Command | Result |
|-------|---------|--------|
| Backend lint | `cd backend && npm run lint` | PASS / FAIL |
| Backend build | `cd backend && npm run build` | PASS / FAIL |
| Backend tests | `cd backend && npm run test:unit` | {n} passing, {n} failing |
| Frontend type-check | `cd frontend && npm run type-check` | PASS / FAIL |
| Frontend lint | `cd frontend && npm run lint` | PASS / FAIL |

### Human Verification Required

#### 1. {Check Name}
**Test:** {What the human should do step by step}
**Expected:** {What they should see}
**Why human:** {Why code inspection alone is insufficient}

### Gaps Summary

{Prose description of any gaps found, or: "No gaps remain. All Observable Truths verified."}

---

_Verified: {timestamp}_
_Verifier: Claude (phase-verify skill)_
```

## Re-Verification Addendum

When re-verifying after gap fixes, add this to the YAML front matter:

```yaml
re_verification:
  previous_status: gaps_found
  previous_score: 5/7
  gaps_closed:
    - "Description of gap 1 that was fixed"
    - "Description of gap 2 that was fixed"
  gaps_remaining:
    - "Description of gap still open (if any)"
  regressions:
    - "Description of regression (if any)"
```

## Gap Detail Template

When `status: gaps_found`, document each gap:

```markdown
### Gap N: {Gap Name} (OPEN | CLOSED)

**Severity:** HIGH | MEDIUM | LOW

| Aspect | Detail |
|--------|--------|
| Current state | {What exists today} |
| What works | {What is functional} |
| What is broken | {Specific failure mode} |
| Plan spec | {What was originally planned} |
| Impact if unfixed | {Downstream consequences} |

**Root cause:** {One sentence}
**Fix approach:** {Numbered steps, estimated effort}
```
