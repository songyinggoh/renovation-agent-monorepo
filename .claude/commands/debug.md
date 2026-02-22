# /debug — Structured Debugging Workflow

## Input
$ARGUMENTS

## Protocol

Follow the debugging sequence from CLAUDE.md exactly. Do not skip steps.

### Step 1: Clarify the Invariant
State precisely what should be true that isn't. If the report is ambiguous, ask one clarifying question before proceeding.

### Step 2: Collect Evidence
- Read relevant logs, stack traces, error messages
- Check recent git diffs (`git log --oneline -10`, `git diff HEAD~3`)
- Inspect environment variables, config files, and process state
- Do NOT speculate without data

### Step 3: Form 3 Ranked Hypotheses

Present in this format:

```
H1 (most likely): [description]
   Falsification: [exact command or check that proves/disproves]

H2: [description]
   Falsification: [exact command or check that proves/disproves]

H3: [description]
   Falsification: [exact command or check that proves/disproves]
```

### Step 4: Isolate
For H1, design and run the smallest possible test that proves or disproves it. Prefer additive instrumentation (logging, assertions) over speculative code edits.

### Step 5: Narrow
Report the result. Eliminate disproven hypotheses. If H1 is disproven, move to H2. Repeat until root cause is isolated.

### Step 6: Fix + Regression Guard
1. Apply the minimal fix for the confirmed root cause
2. Write a test that would have caught this bug before it shipped
3. Run quality gates to verify the fix doesn't break anything
4. Answer: "What structural change prevents this class of bug?"

## Output Format

```
## Bug Report: [title]

**Invariant violated**: [what should be true]
**Evidence collected**: [list of data points]

### Hypotheses
- H1: [status: confirmed/eliminated] ...
- H2: [status: confirmed/eliminated] ...
- H3: [status: confirmed/eliminated] ...

### Root Cause
[confirmed hypothesis with evidence]

### Fix Applied
[files changed, what was changed]

### Regression Test
[test file and description]

### Prevention
[structural change to prevent this class of bug]
```
