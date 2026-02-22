# /trace — Execution Flow Mapping

## Input
$ARGUMENTS

## Protocol

Map the complete execution flow for the described feature or data path across all system boundaries.

### Step 1: Identify Entry Point
Determine where the flow begins (HTTP request, Socket.io event, cron job, queue worker, user action).

### Step 2: Trace Across Boundaries
Follow the flow through every layer, documenting each hop:

1. **Frontend** — Component, hook, API call, Socket.io emit
2. **Network** — HTTP route, Socket.io event, WebSocket message
3. **Backend** — Middleware, controller, service, database query
4. **External** — Third-party APIs, queue jobs, background workers
5. **Database** — Tables read/written, transactions, side effects

At each boundary, note:
- What data crosses the boundary (shape, validation)
- What can fail (timeout, auth, serialization, race condition)
- What is logged/observable

### Step 3: Identify Weakest Point
Flag the single boundary most likely to cause failures. Consider:
- Missing error handling
- Implicit assumptions about data shape
- Unobservable failures (silent drops, swallowed errors)
- Race conditions or timing dependencies

### Step 4: Recommendations
Suggest concrete improvements for the weakest point(s).

## Output Format

```
## Trace: [flow description]

### Flow Map
1. [Component/Layer] → [what happens] → [data shape]
   ↓ [boundary: HTTP/Socket.io/DB/Queue]
2. [Component/Layer] → [what happens] → [data shape]
   ↓ ...
3. ...

### Boundaries Crossed
| # | From → To | Protocol | Can Fail? | Observable? |
|---|-----------|----------|-----------|-------------|
| 1 | ...       | ...      | ...       | ...         |

### Weakest Point
[boundary #, why, what can go wrong]

### Recommendations
- [concrete improvement 1]
- [concrete improvement 2]
```
