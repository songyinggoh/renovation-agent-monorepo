import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailService } from '../../../src/services/email.service.js';

// Mock dependencies
const mockSend = vi.fn();
vi.mock('../../../src/config/email.js', () => ({
  getResendClient: vi.fn(() => ({
    emails: { send: mockSend },
  })),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

const mockQueueAdd = vi.fn();
vi.mock('../../../src/config/queue.js', () => ({
  getEmailQueue: vi.fn(() => ({
    add: mockQueueAdd,
  })),
}));

let mockEmailEnabled = true;
vi.mock('../../../src/config/env.js', () => ({
  env: {
    RESEND_API_KEY: 'test-key',
    FROM_EMAIL: 'test@example.com',
  },
  isEmailEnabled: vi.fn(() => mockEmailEnabled),
}));

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmailEnabled = true;
    service = new EmailService();
  });

  describe('sendEmail (new return type)', () => {
    it('should return success result with email ID', async () => {
      mockSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });

      const result = await service.sendEmail('user@test.com', 'Test Subject', '<p>Hello</p>');

      expect(result).toEqual({ success: true, emailId: 'email-123' });
      expect(mockSend).toHaveBeenCalledWith({
        from: 'test@example.com',
        to: ['user@test.com'],
        subject: 'Test Subject',
        html: '<p>Hello</p>',
      });
    });

    it('should return api_error when Resend returns an error', async () => {
      mockSend.mockResolvedValue({ data: null, error: { message: 'Invalid API key' } });

      const result = await service.sendEmail('user@test.com', 'Subject', '<p>Hi</p>');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('api_error');
        expect(result.error?.message).toBe('Invalid API key');
      }
    });

    it('should return network_error when Resend throws', async () => {
      mockSend.mockRejectedValue(new Error('Network timeout'));

      const result = await service.sendEmail('user@test.com', 'Subject', '<p>Hi</p>');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('network_error');
        expect(result.error?.message).toBe('Network timeout');
      }
    });

    it('should return disabled reason when email is disabled', async () => {
      mockEmailEnabled = false;

      const result = await service.sendEmail('user@test.com', 'Subject', '<p>Hi</p>');

      expect(result).toEqual({ success: false, reason: 'disabled' });
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('sendEmailLegacy (backward compatibility)', () => {
    it('should return email ID on success', async () => {
      mockSend.mockResolvedValue({ data: { id: 'email-456' }, error: null });

      const result = await service.sendEmailLegacy('user@test.com', 'Subject', '<p>Hi</p>');

      expect(result).toBe('email-456');
    });

    it('should return null on failure', async () => {
      mockSend.mockResolvedValue({ data: null, error: { message: 'Error' } });

      const result = await service.sendEmailLegacy('user@test.com', 'Subject', '<p>Hi</p>');

      expect(result).toBeNull();
    });
  });

  describe('sendTemplated (new return type)', () => {
    it('should render template and send email with success result', async () => {
      mockSend.mockResolvedValue({ data: { id: 'email-456' }, error: null });

      const result = await service.sendTemplated('user@test.com', 'welcome', {
        userName: 'Alice',
        dashboardUrl: 'https://app.example.com',
      });

      expect(result).toEqual({ success: true, emailId: 'email-456' });
      expect(mockSend).toHaveBeenCalledTimes(1);
      const call = mockSend.mock.calls[0][0];
      expect(call.subject).toBe('Welcome to Renovation Agent');
      expect(call.html).toContain('Alice');
      expect(call.html).toContain('https://app.example.com');
    });

    it('should render phase-transition template correctly', async () => {
      mockSend.mockResolvedValue({ data: { id: 'email-789' }, error: null });

      const result = await service.sendTemplated('user@test.com', 'phase-transition', {
        userName: 'Bob',
        sessionTitle: 'Kitchen Reno',
        previousPhase: 'INTAKE',
        newPhase: 'CHECKLIST',
        sessionUrl: 'https://app.example.com/session/123',
      });

      expect(result).toEqual({ success: true, emailId: 'email-789' });
      const call = mockSend.mock.calls[0][0];
      expect(call.subject).toContain('Kitchen Reno');
      expect(call.subject).toContain('Checklist');
      expect(call.html).toContain('Bob');
    });
  });

  describe('sendTemplatedLegacy (backward compatibility)', () => {
    it('should return email ID on success', async () => {
      mockSend.mockResolvedValue({ data: { id: 'email-999' }, error: null });

      const result = await service.sendTemplatedLegacy('user@test.com', 'welcome', {
        userName: 'Test',
        dashboardUrl: 'https://example.com',
      });

      expect(result).toBe('email-999');
    });

    it('should return null on failure', async () => {
      mockEmailEnabled = false;

      const result = await service.sendTemplatedLegacy('user@test.com', 'welcome', {
        userName: 'Test',
        dashboardUrl: 'https://example.com',
      });

      expect(result).toBeNull();
    });
  });

  describe('enqueueEmail', () => {
    it('should add job to BullMQ queue', async () => {
      mockQueueAdd.mockResolvedValue({ id: 'job-001' });

      const result = await service.enqueueEmail('user@test.com', 'welcome', {
        userName: 'Charlie',
        dashboardUrl: 'https://app.example.com',
      });

      expect(result).toBe('job-001');
      expect(mockQueueAdd).toHaveBeenCalledTimes(1);
      const [jobName, jobData, jobOpts] = mockQueueAdd.mock.calls[0];
      expect(jobName).toBe('email:send-notification');
      expect(jobData.to).toBe('user@test.com');
      expect(jobData.subject).toBe('Welcome to Renovation Agent');
      expect(jobOpts.attempts).toBe(3);
      expect(jobOpts.backoff).toEqual({ type: 'exponential', delay: 5000 });
    });

    it('should skip enqueue when email is disabled', async () => {
      mockEmailEnabled = false;

      const result = await service.enqueueEmail('user@test.com', 'welcome', {
        userName: 'Charlie',
        dashboardUrl: 'https://app.example.com',
      });

      expect(result).toBeNull();
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('should return null when queue add fails', async () => {
      mockQueueAdd.mockRejectedValue(new Error('Redis down'));

      const result = await service.enqueueEmail('user@test.com', 'welcome', {
        userName: 'Charlie',
        dashboardUrl: 'https://app.example.com',
      });

      expect(result).toBeNull();
    });
  });
});
