# Tool Test Template

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Hoist mock factories — these must be available inside vi.mock() callbacks
const { mockDoWork, mockDbSelect } = vi.hoisted(() => ({
  mockDoWork: vi.fn(),
  mockDbSelect: vi.fn(),
}));

// 2. Mock Logger (suppress output, verify logging calls)
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// 3. Mock services the tool depends on
vi.mock('../../../src/services/my.service.js', () => ({
  MyService: vi.fn().mockImplementation(() => ({
    doWork: mockDoWork,
  })),
}));

// 4. Mock DB if the tool does direct queries
// vi.mock('../../../src/db/index.js', () => ({
//   db: {
//     select: mockDbSelect.mockReturnValue({
//       from: vi.fn().mockReturnValue({
//         where: vi.fn().mockResolvedValue([]),
//       }),
//     }),
//   },
// }));

// 5. Mock agent-guards if the tool uses formatAsyncToolResponse
// vi.mock('../../../src/utils/agent-guards.js', () => ({
//   formatAsyncToolResponse: vi.fn((name, jobId, sec) =>
//     JSON.stringify({ status: 'started', jobId, message: `${name} started` })
//   ),
// }));

// 6. Import the tool AFTER all vi.mock() calls (critical for hoisting)
import { myToolNameTool } from '../../../src/tools/my-tool-name.tool.js';

// 7. Test constants
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const ROOM_ID = '660e8400-e29b-41d4-a716-446655440001';

describe('myToolNameTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: Verify tool metadata
  it('should have correct name and description', () => {
    expect(myToolNameTool.name).toBe('my_tool_name');
    expect(myToolNameTool.description).toBeTruthy();
    expect(myToolNameTool.description.length).toBeGreaterThan(10);
  });

  // Test 2: Happy path
  it('should return success JSON on valid input', async () => {
    mockDoWork.mockResolvedValue({ id: 'abc', data: 'result' });

    const result = await myToolNameTool.invoke({
      sessionId: SESSION_ID,
      param1: 'test-value',
    });

    const parsed = JSON.parse(result) as { success: boolean; data: unknown };
    expect(parsed.success).toBe(true);
    expect(mockDoWork).toHaveBeenCalledWith(SESSION_ID, 'test-value');
  });

  // Test 3: Error path — service throws
  it('should return failure JSON when service throws', async () => {
    mockDoWork.mockRejectedValue(new Error('DB connection failed'));

    const result = await myToolNameTool.invoke({
      sessionId: SESSION_ID,
      param1: 'test-value',
    });

    const parsed = JSON.parse(result) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('DB connection failed');
  });

  // Test 4: Verify service called with correct args
  it('should pass correct arguments to service', async () => {
    mockDoWork.mockResolvedValue({});

    await myToolNameTool.invoke({
      sessionId: SESSION_ID,
      param1: 'specific-value',
    });

    expect(mockDoWork).toHaveBeenCalledTimes(1);
    expect(mockDoWork).toHaveBeenCalledWith(SESSION_ID, 'specific-value');
  });
});
```

## Testing Conventions

- Use `vi.hoisted()` for mock values that factory functions close over
- Import the tool AFTER all `vi.mock()` calls — critical for hoisting to work
- Use named UUID constants (`SESSION_ID`, `ROOM_ID`)
- Always test: (a) metadata, (b) happy path, (c) error path, (d) correct args
- For async tools: also test that queue `.add()` was called with correct job data
- For DB-direct tools: mock `db` with chainable builder pattern
