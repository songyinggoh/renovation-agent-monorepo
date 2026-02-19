import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { type Job, UnrecoverableError } from 'bullmq';

// Mock dependencies BEFORE any imports
const mockGetResendClient = vi.fn();
const mockIsEmailEnabled = vi.fn();
const mockCreateWorker = vi.fn();

vi.mock('../../../src/config/redis.js', () => ({
  getRedisConnection: vi.fn(() => ({
    duplicate: vi.fn(() => ({})),
  })),
  redis: null,
  connectRedis: vi.fn(),
  closeRedis: vi.fn(),
  testRedisConnection: vi.fn(),
}));

vi.mock('../../../src/config/email.js', () => ({
  getResendClient: () => mockGetResendClient(),
}));

vi.mock('../../../src/config/env.js', () => ({
  isEmailEnabled: () => mockIsEmailEnabled(),
  env: {
    FROM_EMAIL: 'test@example.com',
    REDIS_URL: 'redis://localhost:6379',
  },
}));

vi.mock('../../../src/config/queue.js', () => ({
  createWorker: (...args: unknown[]) => mockCreateWorker(...args),
  getEmailQueue: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

interface EmailJobData {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}

describe('Email Worker', () => {
  let processEmailJob: (job: Job<EmailJobData>) => Promise<void>;
  let mockResendSend: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mocks to default success state
    mockIsEmailEnabled.mockReturnValue(true);
    mockResendSend = vi.fn().mockResolvedValue({ data: { id: 'email-123' }, error: null });
    mockGetResendClient.mockReturnValue({ emails: { send: mockResendSend } });
    mockCreateWorker.mockReturnValue({});

    // Import and extract the processor function
    const worker = await import('../../../src/workers/email.worker.js');

    // Start the worker to register the processor
    worker.startEmailWorker();

    // Extract the processor from the createWorker call
    const calls = mockCreateWorker.mock.calls;
    if (calls.length === 0) {
      throw new Error('createWorker was not called');
    }
    processEmailJob = calls[0][1] as typeof processEmailJob;
  });

  describe('processEmailJob', () => {
    it('should send email successfully with valid job data', async () => {
      const job = {
        id: 'job-1',
        data: {
          to: 'user@example.com',
          subject: 'Test Email',
          template: 'session-created',
          data: { html: '<p>Test</p>' },
        },
      } as Job<EmailJobData>;

      await processEmailJob(job);

      expect(mockResendSend).toHaveBeenCalledWith({
        from: 'test@example.com',
        to: ['user@example.com'],
        subject: 'Test Email',
        html: '<p>Test</p>',
      });
    });

    it('should skip sending when email is disabled', async () => {
      mockIsEmailEnabled.mockReturnValue(false);

      const job = {
        id: 'job-2',
        data: {
          to: 'user@example.com',
          subject: 'Test',
          template: 'session-created',
          data: { html: '<p>Test</p>' },
        },
      } as Job<EmailJobData>;

      await processEmailJob(job);

      expect(mockResendSend).not.toHaveBeenCalled();
    });

    it('should throw UnrecoverableError when "to" is missing', async () => {
      const job = {
        id: 'job-3',
        data: {
          to: '',
          subject: 'Test',
          template: 'session-created',
          data: { html: '<p>Test</p>' },
        },
      } as Job<EmailJobData>;

      await expect(processEmailJob(job)).rejects.toThrow(UnrecoverableError);
      await expect(processEmailJob(job)).rejects.toThrow('Invalid job data');
    });

    it('should throw UnrecoverableError when "subject" is missing', async () => {
      const job = {
        id: 'job-4',
        data: {
          to: 'user@example.com',
          subject: '',
          template: 'session-created',
          data: { html: '<p>Test</p>' },
        },
      } as Job<EmailJobData>;

      await expect(processEmailJob(job)).rejects.toThrow(UnrecoverableError);
    });

    it('should throw UnrecoverableError when "data.html" is missing', async () => {
      const job = {
        id: 'job-5',
        data: {
          to: 'user@example.com',
          subject: 'Test',
          template: 'session-created',
          data: {},
        },
      } as Job<EmailJobData>;

      await expect(processEmailJob(job)).rejects.toThrow(UnrecoverableError);
      await expect(processEmailJob(job)).rejects.toThrow('"data.html" must be a string');
    });

    it('should throw UnrecoverableError when "data.html" is not a string', async () => {
      const job = {
        id: 'job-6',
        data: {
          to: 'user@example.com',
          subject: 'Test',
          template: 'session-created',
          data: { html: 123 },
        },
      } as Job<EmailJobData>;

      await expect(processEmailJob(job)).rejects.toThrow(UnrecoverableError);
    });

    it('should throw UnrecoverableError when Resend client is unavailable', async () => {
      mockGetResendClient.mockReturnValue(null);

      const job = {
        id: 'job-7',
        data: {
          to: 'user@example.com',
          subject: 'Test',
          template: 'session-created',
          data: { html: '<p>Test</p>' },
        },
      } as Job<EmailJobData>;

      await expect(processEmailJob(job)).rejects.toThrow(UnrecoverableError);
      await expect(processEmailJob(job)).rejects.toThrow('Resend client not available');
    });

    it('should throw UnrecoverableError for permanent Resend API errors', async () => {
      mockResendSend.mockResolvedValue({
        data: null,
        error: { message: 'invalid_to_address', name: 'validation_error' },
      });

      const job = {
        id: 'job-8',
        data: {
          to: 'user@example.com',
          subject: 'Test',
          template: 'session-created',
          data: { html: '<p>Test</p>' },
        },
      } as Job<EmailJobData>;

      await expect(processEmailJob(job)).rejects.toThrow(UnrecoverableError);
      await expect(processEmailJob(job)).rejects.toThrow('Permanent Resend error');
    });

    it('should throw retriable Error for temporary Resend API errors', async () => {
      mockResendSend.mockResolvedValue({
        data: null,
        error: { message: 'rate_limit_exceeded', name: 'rate_limit' },
      });

      const job = {
        id: 'job-9',
        data: {
          to: 'user@example.com',
          subject: 'Test',
          template: 'session-created',
          data: { html: '<p>Test</p>' },
        },
      } as Job<EmailJobData>;

      await expect(processEmailJob(job)).rejects.toThrow(Error);
      await expect(processEmailJob(job)).rejects.not.toThrow(UnrecoverableError);
      await expect(processEmailJob(job)).rejects.toThrow('Resend error: rate_limit_exceeded');
    });

    it('should throw retriable Error for network exceptions', async () => {
      mockResendSend.mockRejectedValue(new Error('Network timeout'));

      const job = {
        id: 'job-10',
        data: {
          to: 'user@example.com',
          subject: 'Test',
          template: 'session-created',
          data: { html: '<p>Test</p>' },
        },
      } as Job<EmailJobData>;

      await expect(processEmailJob(job)).rejects.toThrow(Error);
      await expect(processEmailJob(job)).rejects.not.toThrow(UnrecoverableError);
      await expect(processEmailJob(job)).rejects.toThrow('Email send failed: Network timeout');
    });

    it('should re-throw UnrecoverableError as-is when caught', async () => {
      mockResendSend.mockRejectedValue(new UnrecoverableError('Permanent failure'));

      const job = {
        id: 'job-11',
        data: {
          to: 'user@example.com',
          subject: 'Test',
          template: 'session-created',
          data: { html: '<p>Test</p>' },
        },
      } as Job<EmailJobData>;

      await expect(processEmailJob(job)).rejects.toThrow(UnrecoverableError);
      await expect(processEmailJob(job)).rejects.toThrow('Permanent failure');
    });
  });

  describe('startEmailWorker', () => {
    it('should create worker with correct parameters', async () => {
      const worker = await import('../../../src/workers/email.worker.js');
      vi.clearAllMocks();

      worker.startEmailWorker();

      expect(mockCreateWorker).toHaveBeenCalledWith(
        'email:send-notification',
        expect.any(Function),
        // No explicit concurrency — derived from WORKER_PROFILES
      );
    });
  });
});
