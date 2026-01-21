# Skills Quick Start Guide

## Using the `/plan` Skill

The `/plan` skill automates the research → planning → tracking → TDD workflow.

### Quick Usage

```bash
/plan [describe what you want to build or fix]
```

### Examples

```bash
# New feature
/plan add pagination to the sessions API endpoint

# Bug fix
/plan fix the authentication middleware timeout issue

# Enhancement
/plan add image compression to file uploads

# Complex feature
/plan implement real-time collaboration with Socket.io
```

### What Happens

1. **Automatic Research** (2-5 min)
   - Claude searches your codebase for patterns
   - Performs web searches for best practices
   - Evaluates 3-5 different approaches
   - Creates: `docs/research/[TOPIC]_Research.md`

2. **Implementation Planning** (1-3 min)
   - Creates detailed step-by-step plan
   - Includes actual code snippets
   - Lists exact files to create/modify
   - Creates: `docs/implementation plan/[TOPIC]_Implementation_Plan.md`

3. **Progress Tracking** (< 1 min)
   - Creates checklist of all tasks
   - Creates: `docs/implementation plan/[TOPIC]_PROGRESS.md`

4. **Approval Gate** ⏸️
   - Claude presents the plan
   - **You must approve before Claude proceeds**

5. **TDD Implementation** (varies)
   - RED: Write failing tests first
   - GREEN: Make tests pass
   - REFACTOR: Improve code quality
   - QUALITY GATE: Run lint, type-check, tests
   - Updates progress tracker in real-time

### Output Structure

```
docs/
├── research/
│   └── [TOPIC]_Research.md          # Problem analysis + 3-5 solutions
└── implementation plan/
    ├── [TOPIC]_Implementation_Plan.md  # Step-by-step guide
    └── [TOPIC]_PROGRESS.md             # Live progress tracker
```

### Research Document Contains

- Problem statement
- Current state analysis (code snippets, file paths)
- 3-5 solution vectors with:
  - Pros/Cons
  - Complexity rating
  - Time estimate
  - Fit score (1-10)
  - Code snippets
  - Files to modify
- Recommended approach
- Dependencies
- References

### Implementation Plan Contains

- Overview (objective, value, components)
- Research summary
- Phased implementation strategy
- Tasks with code snippets
- Test specifications
- Files to create/modify
- Success metrics
- Quality gates
- Rollback plan

### Progress Tracker Contains

- Real-time status (🔴 → 🟡 → 🟢 → ✅)
- Task checklist (updates as work progresses)
- Current blockers
- Next actions
- Completed tasks log
- Quality gate status

### Quality Gates (Automatic)

Before any commit, Claude runs:
```bash
# Backend
npm run lint              # ESLint
npm run type-check        # TypeScript
npm run test:unit         # Vitest
npm run test:coverage     # Must be ≥80%

# Frontend
npm run lint              # ESLint
npm run type-check        # TypeScript
```

### Best Practices

1. **Be specific**: `/plan add user profile picture upload with S3` > `/plan add profile pics`
2. **Include context**: `/plan fix the memory leak in websocket connections` > `/plan fix memory leak`
3. **One feature at a time**: Don't combine multiple features in one `/plan` call
4. **Review the plan**: Always read the research + plan before approving
5. **Trust the process**: The research phase might seem slow, but it prevents costly mistakes

### When NOT to Use `/plan`

Skip `/plan` for trivial tasks:
- Fixing typos
- Updating documentation
- Adding a single line of code
- Simple refactoring

Use `/plan` for everything else.

### Troubleshooting

**"Skill not found"**
- Make sure you're using `/plan` (with the slash)
- Check `.claude/skills/plan.md` exists

**"No research document created"**
- Check `docs/research/` directory exists
- Verify write permissions

**"Quality gates failing"**
- Claude will not commit until all gates pass
- Fix errors before proceeding
- Coverage must be ≥80%

### Advanced: Customizing the Skill

Edit `.claude/skills/plan.md` to:
- Change document templates
- Add/remove solution vectors
- Modify quality gate requirements
- Customize workflow steps

---

**Pro Tip**: Combine `/plan` with specific requirements:
```bash
/plan add GraphQL API for sessions (use Apollo Server, follow existing patterns in backend/src/routes/)
```
