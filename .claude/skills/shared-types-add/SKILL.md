---
name: shared-types-add
description: >
  Adds a new type, interface, or constant to the packages/shared-types package with correct
  barrel export, build step, and consumer verification. Handles the asymmetric resolution
  (frontend reads source, backend reads dist). Use when adding types that cross the
  backend/frontend boundary — Socket.io events, REST API shapes, DB enums surfacing in UI.
user-invocable: true
---

# /shared-types-add

Adds types to the `@renovation/shared-types` package with correct wiring for both consumers. The frontend resolves via TypeScript source directly; the backend resolves via compiled `dist/` — forgetting the build step makes the type invisible to the backend.

## When to Use

- Adding a new Socket.io event payload type
- Adding a REST API response shape shared between backend and frontend
- Adding a DB enum/constant that surfaces in the UI (phases, statuses, categories)
- Extracting duplicated types from backend and frontend into shared-types
- Adding a new domain module to shared-types

## When NOT to Use

- Types used only in the backend (keep in `backend/src/`)
- Types used only in the frontend (keep in `frontend/types/`)
- Implementation details that don't cross the boundary

## Invocation

```
/shared-types-add <description of the type>
```

**Examples**:
```
/shared-types-add add RenderStage union type for render pipeline events
/shared-types-add add DocumentPayload interface for doc:complete Socket.io event
/shared-types-add add CONTRACTOR_SPECIALTIES const array with derived union type
/shared-types-add extract BudgetSummary interface used in both REST API and frontend
```

## Package Structure

```
packages/shared-types/
├── src/
│   ├── index.ts            ← barrel (MUST export everything)
│   ├── phases.ts           ← RENOVATION_PHASES, RenovationPhase
│   ├── session.ts          ← SessionStylePreferences, RoomSummary
│   ├── assets.ts           ← ASSET_TYPES, AssetType, ALLOWED_MIME_TYPES
│   ├── messages.ts         ← MESSAGE_ROLES, MessageRole, MESSAGE_TYPES
│   ├── constants.ts        ← PRODUCT_CATEGORIES, ROOM_TYPES, STYLE_SLUG_REGEX
│   └── socket-events.ts    ← All Socket.io payload types + event maps
├── dist/                   ← Compiled output (backend reads this)
├── package.json            ← @renovation/shared-types
└── tsconfig.json           ← NodeNext, declaration: true
```

## Resolution Asymmetry

| Consumer | Resolves via | Needs build? |
|---|---|---|
| **Frontend** | `tsconfig paths → ../packages/shared-types/src/index.ts` | No (reads source directly) |
| **Backend** | `tsconfig paths → ../packages/shared-types/dist/index.d.ts` | **Yes** (must rebuild) |

**This means**: After adding a type, the frontend sees it immediately but the backend won't until you run the build.

## Workflow

### Step 1: Choose the Source File

| Type belongs to... | Add to file |
|---|---|
| Socket.io event payloads | `socket-events.ts` |
| Phase/workflow enums | `phases.ts` |
| Session/room shapes | `session.ts` |
| Asset types/statuses | `assets.ts` |
| Message types | `messages.ts` |
| Product/room/style constants | `constants.ts` |
| New domain (none of the above) | Create new `{domain}.ts` |

### Step 2: Write the Export

Follow existing patterns:

**Const array + union type** (for enums):
```typescript
export const MY_VALUES = ['value_a', 'value_b', 'value_c'] as const;
export type MyValue = (typeof MY_VALUES)[number];
```

**Interface** (for shapes):
```typescript
export interface MyPayload {
  sessionId: string;
  status: MyValue;
  data: Record<string, unknown>;
}
```

**Cross-file imports** (use `.js` extension — required by NodeNext):
```typescript
import type { RenovationPhase } from './phases.js';
```

### Step 3: Export from Barrel

Add to `packages/shared-types/src/index.ts`:

```typescript
// If adding to an existing file — add new exports to the existing line:
export { existingExport, MyNewType, MY_NEW_CONST } from './existing-file.js';

// If creating a new file — add a new export line:
export { MyNewType, MY_VALUES, type MyValue } from './new-domain.js';
```

**Critical**: The `.js` extension is required even though the source files are `.ts`. This is because `tsconfig.json` uses `module: "NodeNext"`.

### Step 4: Build the Package

```bash
pnpm --filter @renovation/shared-types build
```

This regenerates `dist/*.js`, `dist/*.d.ts`, and `dist/*.d.ts.map`. The backend path alias points at `dist/`, so it won't see new types until this runs.

### Step 5: Verify Both Consumers

```bash
# Backend type-check (resolves via dist/)
cd backend && npx tsc --noEmit

# Frontend type-check (resolves via src/ directly)
cd frontend && npm run type-check
```

### Step 6: Import in Consumer Code

**Direct import** (simple, used by server.ts, chat.service.ts):
```typescript
import type { MyPayload } from '@renovation/shared-types';
```

**Re-export shim** (preferred for widely-used types):
```typescript
// backend/src/validators/constants.ts
export { MY_VALUES, type MyValue } from '@renovation/shared-types';

// frontend/types/chat.ts
export type { MyPayload } from '@renovation/shared-types';
```

### Step 7: Commit Checklist

- [ ] Source file(s) in `packages/shared-types/src/`
- [ ] Updated barrel `packages/shared-types/src/index.ts`
- [ ] Rebuilt dist (run build before committing if dist is tracked)

## Quick Reference

| Pattern | Example |
|---|---|
| Const array | `export const FOO = ['a', 'b'] as const;` |
| Union from array | `export type Foo = (typeof FOO)[number];` |
| Interface | `export interface FooPayload { ... }` |
| Cross-file import | `import type { Bar } from './bar.js';` |
| Consumer import | `import type { Foo } from '@renovation/shared-types';` |
| Build command | `pnpm --filter @renovation/shared-types build` |
| Internal import ext | Always `.js` (NodeNext requirement) |

## Common Mistakes

| Mistake | Fix |
|---|---|
| Forgot to add to `index.ts` barrel | Type is invisible to consumers — always update barrel |
| Missing `.js` extension on internal import | Build fails — NodeNext requires `.js` even for `.ts` sources |
| Forgot to rebuild after adding type | Backend can't see the type — run `pnpm --filter @renovation/shared-types build` |
| Created new file but no barrel entry | Add `export { ... } from './new-file.js';` to `index.ts` |
| Used `import` instead of `import type` | Works but wastes bundle size — use `import type` for type-only imports |
| Duplicated type in both backend and frontend | Extract to shared-types instead — single source of truth |
