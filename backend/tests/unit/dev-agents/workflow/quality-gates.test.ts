import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../../../src/utils/execFileNoThrow.js', () => ({
  execFileNoThrow: vi.fn(),
}));

import { runQualityGates } from '../../../../src/dev-agents/workflow/quality-gates.js';
import type { QualityGateResult } from '../../../../src/dev-agents/workflow/quality-gates.js';
import { execFileNoThrow } from '../../../../src/utils/execFileNoThrow.js';

const mockExecFileNoThrow = vi.mocked(execFileNoThrow);

describe('runQualityGates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns passed=true when all checks succeed', async () => {
    mockExecFileNoThrow.mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    });

    const result: QualityGateResult = await runQualityGates('/fake/root');

    expect(result.passed).toBe(true);
    expect(result.output).toContain('PASSED');
  });

  it('runs 5 quality checks', async () => {
    mockExecFileNoThrow.mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    });

    await runQualityGates('/fake/root');

    // 5 checks: backend lint, backend build, backend test, frontend lint, frontend type-check
    expect(mockExecFileNoThrow).toHaveBeenCalledTimes(5);
  });

  it('returns passed=false on first failure', async () => {
    // First call succeeds (backend:lint), second fails (backend:build)
    mockExecFileNoThrow
      .mockResolvedValueOnce({ stdout: 'ok', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: 'tsc error', exitCode: 1 });

    const result = await runQualityGates('/fake/root');

    expect(result.passed).toBe(false);
    expect(result.output).toContain('FAILED');
    expect(result.output).toContain('backend:build');
  });

  it('stops on first failure and does not run remaining checks', async () => {
    mockExecFileNoThrow
      .mockResolvedValueOnce({ stdout: '', stderr: 'lint error', exitCode: 1 });

    await runQualityGates('/fake/root');

    // Should stop after first failure (backend:lint)
    expect(mockExecFileNoThrow).toHaveBeenCalledTimes(1);
  });

  it('passes correct cwd for backend checks', async () => {
    mockExecFileNoThrow.mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    });

    await runQualityGates('/my/project');

    // First 3 calls should be backend
    const calls = mockExecFileNoThrow.mock.calls;
    expect(calls[0][2].cwd).toBe('/my/project/backend');
    expect(calls[1][2].cwd).toBe('/my/project/backend');
    expect(calls[2][2].cwd).toBe('/my/project/backend');
  });

  it('passes correct cwd for frontend checks', async () => {
    mockExecFileNoThrow.mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    });

    await runQualityGates('/my/project');

    // Last 2 calls should be frontend
    const calls = mockExecFileNoThrow.mock.calls;
    expect(calls[3][2].cwd).toBe('/my/project/frontend');
    expect(calls[4][2].cwd).toBe('/my/project/frontend');
  });

  it('includes stdout and stderr in failure output', async () => {
    mockExecFileNoThrow.mockResolvedValueOnce({
      stdout: 'some output',
      stderr: 'some error',
      exitCode: 2,
    });

    const result = await runQualityGates('/fake/root');

    expect(result.output).toContain('some output');
    expect(result.output).toContain('some error');
    expect(result.output).toContain('Exit code: 2');
  });

  it('sets 120s timeout per check', async () => {
    mockExecFileNoThrow.mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    });

    await runQualityGates('/fake/root');

    for (const call of mockExecFileNoThrow.mock.calls) {
      expect(call[2].timeout).toBe(120_000);
    }
  });

  it('lists all passed check names on success', async () => {
    mockExecFileNoThrow.mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    });

    const result = await runQualityGates('/fake/root');

    expect(result.output).toContain('PASSED: backend:lint');
    expect(result.output).toContain('PASSED: backend:build');
    expect(result.output).toContain('PASSED: backend:test');
    expect(result.output).toContain('PASSED: frontend:lint');
    expect(result.output).toContain('PASSED: frontend:type-check');
  });
});
