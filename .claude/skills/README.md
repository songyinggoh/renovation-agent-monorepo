# Claude Code Skills

This directory contains custom skills for Claude Code to enhance development workflows.

## Available Skills

### `/plan` - Research-Driven Implementation Planning

Comprehensive planning skill that follows the workflow: Research → Plan → Track → Execute with TDD.

**When to use:**
- Before implementing any new feature
- When solving complex problems
- When fixing non-trivial bugs
- Any task requiring architectural decisions

**What it does:**
1. **Research Phase**
   - Searches codebase for existing patterns
   - Performs web research for best practices
   - Applies first-principles thinking
   - Evaluates 3-5 solution vectors
   - Exports to `docs/research/[TOPIC]_Research.md`

2. **Planning Phase**
   - Creates detailed implementation plan
   - Includes code snippets and file paths
   - Defines success metrics and quality gates
   - Exports to `docs/implementation plan/[TOPIC]_Implementation_Plan.md`

3. **Tracking Phase**
   - Creates progress tracker with task checklist
   - Exports to `docs/implementation plan/[TOPIC]_PROGRESS.md`

4. **Execution Phase** (after approval)
   - Follows TDD workflow (RED → GREEN → REFACTOR)
   - Updates progress tracker in real-time
   - Ensures all quality gates pass

**Usage:**
```bash
/plan [topic or feature description]

# Examples:
/plan add pagination to sessions API
/plan fix authentication middleware bug
/plan implement image upload with compression
```

**Workflow:**
1. Claude researches the problem thoroughly
2. Creates research document with 3-5 solution options
3. Creates implementation plan with detailed steps
4. Creates progress tracker
5. **Waits for your approval** before proceeding
6. After approval, implements using TDD
7. Ensures quality gates pass (lint, type-check, tests, coverage ≥80%)

**Output Files:**
- `docs/research/[TOPIC]_Research.md` - Analysis and solution vectors
- `docs/implementation plan/[TOPIC]_Implementation_Plan.md` - Step-by-step plan
- `docs/implementation plan/[TOPIC]_PROGRESS.md` - Real-time progress tracker

## Skill Development

To create a new skill:
1. Create `[skill-name].md` in `.claude/skills/`
2. Define clear workflow and templates
3. Document in this README
4. Test with `/[skill-name]` command
