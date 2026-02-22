# /instrument — Additive Debugging Instrumentation

## Input
$ARGUMENTS

## Protocol

Add removable logging, assertions, and timing to the target file/function WITHOUT modifying existing logic. All instrumentation must be clearly marked for easy removal.

### Step 1: Read the Target
Read the file or function specified. Understand the control flow, inputs, outputs, and side effects.

### Step 2: Identify Instrumentation Points
For each function in scope, identify:
- **Entry**: Log input arguments and caller context
- **Exit**: Log return value and elapsed time
- **Branches**: Log which branch was taken and why
- **Errors**: Log caught/thrown errors with full context
- **Async boundaries**: Log before/after awaits with timing

### Step 3: Add Instrumentation
Use the project's structured Logger (not console.log). Prefix all instrumentation with a tag for easy grep/removal:

```typescript
// [INSTRUMENT] — remove after debugging
log.debug("[INSTRUMENT] functionName entry", { arg1, arg2 });
```

Add timing:
```typescript
// [INSTRUMENT] — remove after debugging
const _instrStart = performance.now();
// ... existing code ...
log.debug("[INSTRUMENT] functionName completed", { elapsed: performance.now() - _instrStart });
```

Add assertions for assumed invariants:
```typescript
// [INSTRUMENT] — remove after debugging
if (!expectedCondition) log.warn("[INSTRUMENT] invariant violated", { context });
```

### Rules
- NEVER modify existing logic, control flow, or return values
- ALL added lines must include the `[INSTRUMENT]` tag
- Use `log.debug` level so instrumentation doesn't pollute production logs
- Instrument the file in-place — do not create wrapper files

## Output Format

```
## Instrumented: [file/function]

### Points Added
| Location | Type | What It Observes |
|----------|------|------------------|
| line N   | entry log | function args |
| line N   | timing | elapsed ms |
| line N   | assertion | invariant X |

### Removal
To remove all instrumentation:
  grep -n "\[INSTRUMENT\]" <file>
  # then delete those lines, or revert the commit
```
