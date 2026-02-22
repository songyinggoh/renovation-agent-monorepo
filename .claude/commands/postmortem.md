# /postmortem — Structured Incident Postmortem

## Input
$ARGUMENTS

## Protocol

Generate a structured, blameless postmortem for the described incident. Focus on systemic causes and prevention, not individual fault.

### Step 1: Establish Timeline
Investigate the incident and reconstruct what happened:
- When did the issue start?
- When was it detected? How? (Alert, user report, manual check?)
- When was it resolved?
- What was the gap between start and detection?

### Step 2: Determine Impact
- What was affected? (Users, data, revenue, SLAs)
- What was the blast radius? (All users, subset, internal only)
- Was data lost or corrupted?

### Step 3: Root Cause Analysis
Apply the "5 Whys" technique:
1. Why did the failure occur? → [proximate cause]
2. Why was that possible? → [contributing factor]
3. Why wasn't it caught? → [detection gap]
4. Why wasn't it prevented? → [process gap]
5. Why does that gap exist? → [systemic cause]

### Step 4: Action Items
For each action item, specify:
- What: concrete task description
- Priority: P0 (do now), P1 (this sprint), P2 (backlog)
- Owner: who is responsible
- Verification: how to confirm it's done

Categorize actions:
- **Prevent**: Stop this from happening again
- **Detect**: Catch it faster next time
- **Mitigate**: Reduce impact if it happens again

## Output Format

```
## Postmortem: [incident title]
**Date**: [date]
**Severity**: [SEV1/SEV2/SEV3]
**Duration**: [start → detection → resolution]

### Summary
[2-3 sentences: what happened, impact, resolution]

### Timeline
| Time | Event |
|------|-------|
| ...  | ...   |

### Impact
- **Users affected**: [count/scope]
- **Data impact**: [none/degraded/lost]
- **Duration of impact**: [time]

### Root Cause (5 Whys)
1. ...
2. ...
3. ...
4. ...
5. **Systemic cause**: ...

### What Went Well
- [things that helped detection/resolution]

### What Went Wrong
- [things that caused/prolonged the incident]

### Action Items
| Priority | Category | Action | Owner | Verification |
|----------|----------|--------|-------|--------------|
| P0       | Prevent  | ...    | ...   | ...          |
| P1       | Detect   | ...    | ...   | ...          |
| P2       | Mitigate | ...    | ...   | ...          |

### Lessons Learned
[1-2 key takeaways for the team]
```
