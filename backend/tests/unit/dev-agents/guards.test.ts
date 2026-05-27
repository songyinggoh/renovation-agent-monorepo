import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock agent-killswitch
vi.mock('../../../src/utils/agent-killswitch.js', () => ({
  isAgentEnabled: vi.fn(),
}));

// Mock execFileNoThrow
vi.mock('../../../src/utils/execFileNoThrow.js', () => ({
  execFileNoThrow: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { checkKillSwitch, ensureDevBranch, slugify } from '../../../src/dev-agents/guards.js';
import { isAgentEnabled } from '../../../src/utils/agent-killswitch.js';
import { execFileNoThrow } from '../../../src/utils/execFileNoThrow.js';

// ── checkKillSwitch ─────────────────────────────────────────────────────────

describe('checkKillSwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves when agent is enabled', async () => {
    vi.mocked(isAgentEnabled).mockResolvedValue(true);
    await expect(checkKillSwitch('dev-supervisor')).resolves.toBeUndefined();
  });

  it('throws when agent is disabled', async () => {
    vi.mocked(isAgentEnabled).mockResolvedValue(false);
    await expect(checkKillSwitch('dev-supervisor')).rejects.toThrow(
      'Agent "dev-supervisor" is disabled via kill switch'
    );
  });

  it('calls isAgentEnabled with the correct agent ID', async () => {
    vi.mocked(isAgentEnabled).mockResolvedValue(true);
    await checkKillSwitch('scaffold-agent');
    expect(isAgentEnabled).toHaveBeenCalledWith('scaffold-agent');
  });
});

// ── slugify ─────────────────────────────────────────────────────────────────

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Add User Auth')).toBe('add-user-auth');
  });

  it('removes non-alphanumeric characters', () => {
    expect(slugify('scaffold: new tool!')).toBe('scaffold-new-tool');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('fix -- broken   tests')).toBe('fix-broken-tests');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  hello world  ')).toBe('hello-world');
  });

  it('truncates to 50 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(50);
  });
});

// ── ensureDevBranch ─────────────────────────────────────────────────────────

describe('ensureDevBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns current branch if already on a dev-agent/* branch', async () => {
    vi.mocked(execFileNoThrow).mockResolvedValue({
      stdout: 'dev-agent/existing-feature\n',
      stderr: '',
      exitCode: 0,
    });

    const branch = await ensureDevBranch('some task');
    expect(branch).toBe('dev-agent/existing-feature');
  });

  it('creates and checks out a new dev-agent/* branch if on main', async () => {
    // First call: git rev-parse --abbrev-ref HEAD → "main"
    // Second call: git checkout -b dev-agent/<slug> → success
    vi.mocked(execFileNoThrow)
      .mockResolvedValueOnce({ stdout: 'main\n', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

    const branch = await ensureDevBranch('Add new feature');
    expect(branch).toBe('dev-agent/add-new-feature');
    expect(execFileNoThrow).toHaveBeenCalledTimes(2);

    // Verify the checkout command
    const checkoutCall = vi.mocked(execFileNoThrow).mock.calls[1];
    expect(checkoutCall[0]).toBe('git');
    expect(checkoutCall[1]).toContain('checkout');
    expect(checkoutCall[1]).toContain('-b');
    expect(checkoutCall[1]).toContain('dev-agent/add-new-feature');
  });

  it('creates a new branch if on dev', async () => {
    vi.mocked(execFileNoThrow)
      .mockResolvedValueOnce({ stdout: 'dev\n', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

    const branch = await ensureDevBranch('fix tests');
    expect(branch).toBe('dev-agent/fix-tests');
  });

  it('throws if git rev-parse fails', async () => {
    vi.mocked(execFileNoThrow).mockResolvedValue({
      stdout: '',
      stderr: 'not a git repository',
      exitCode: 128,
    });

    await expect(ensureDevBranch('task')).rejects.toThrow('Failed to determine current git branch');
  });

  it('throws if branch creation fails', async () => {
    vi.mocked(execFileNoThrow)
      .mockResolvedValueOnce({ stdout: 'main\n', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: 'fatal: branch already exists', exitCode: 128 });

    await expect(ensureDevBranch('task')).rejects.toThrow('Failed to create branch');
  });
});
