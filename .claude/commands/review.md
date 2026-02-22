# /review — Principal-Level Code Review

## Input
$ARGUMENTS

## Protocol

Perform a principal-engineer-level code review of the specified file or module. Focus on correctness and real problems, not style preferences.

### Review Dimensions

#### 1. Correctness
- Does the code do what it claims to do?
- Are there edge cases that produce wrong results?
- Are error paths handled correctly (not swallowed, not leaking)?
- Are there race conditions, TOCTOU bugs, or async ordering issues?

#### 2. Clarity
- Can another engineer understand this in one read-through?
- Are names accurate (not misleading)?
- Is the abstraction level consistent within each function?
- Are there comments that explain "why" for non-obvious decisions?

#### 3. Testability
- Can each function be tested in isolation?
- Are side effects isolated and injectable?
- Does branching logic have corresponding test coverage?
- Every function with branching needs at minimum: happy path, edge case, failure mode

#### 4. Blast Radius
- What breaks if this code fails?
- Are failures contained or do they cascade?
- Is there observability (logging, metrics) for failure modes?
- What's the rollback path?

#### 5. Security
- Input validation at system boundaries?
- SQL injection, XSS, command injection vectors?
- Secrets handling (logged, hardcoded, exposed)?
- Auth/authz checks present where needed?

### Rules
- Only flag real issues. Do not nitpick style, formatting, or naming conventions that are consistent with the codebase.
- Every finding must include: what's wrong, why it matters, and a concrete fix.
- Rate each finding: CRITICAL (must fix), WARNING (should fix), NOTE (consider).

## Output Format

```
## Code Review: [file/module]

### Summary
[1-2 sentence overall assessment]

### Findings

#### [CRITICAL/WARNING/NOTE] — [short title]
**Location**: [file:line]
**Issue**: [what's wrong]
**Impact**: [why it matters]
**Fix**:
  [concrete code or approach]

---
(repeat for each finding)

### Verdict
- [ ] Ship as-is
- [ ] Ship after fixing CRITICALs
- [ ] Needs rework
```
