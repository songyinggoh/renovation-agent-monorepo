import { describe, it, expect } from 'vitest';
import {
  imageOptimizeJobSchema,
  emailSendNotificationJobSchema,
  docGeneratePlanJobSchema,
  renderGenerateJobSchema,
  aiProcessMessageJobSchema,
} from '../../../src/validators/job.validators.js';

describe('job.validators', () => {
  describe('imageOptimizeJobSchema', () => {
    it('should accept valid image job data', () => {
      const result = imageOptimizeJobSchema.safeParse({
        assetId: '550e8400-e29b-41d4-a716-446655440000',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional width and quality', () => {
      const result = imageOptimizeJobSchema.safeParse({
        assetId: '550e8400-e29b-41d4-a716-446655440000',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        width: 1200,
        quality: 80,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing assetId', () => {
      const result = imageOptimizeJobSchema.safeParse({
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-UUID assetId', () => {
      const result = imageOptimizeJobSchema.safeParse({
        assetId: 'not-a-uuid',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(false);
    });

    it('should reject quality > 100', () => {
      const result = imageOptimizeJobSchema.safeParse({
        assetId: '550e8400-e29b-41d4-a716-446655440000',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        quality: 101,
      });
      expect(result.success).toBe(false);
    });

    it('should reject quality < 1', () => {
      const result = imageOptimizeJobSchema.safeParse({
        assetId: '550e8400-e29b-41d4-a716-446655440000',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        quality: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('emailSendNotificationJobSchema', () => {
    it('should accept valid email job data', () => {
      const result = emailSendNotificationJobSchema.safeParse({
        to: 'user@example.com',
        subject: 'Welcome',
        template: 'welcome',
        data: { html: '<p>Hello</p>' },
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email address', () => {
      const result = emailSendNotificationJobSchema.safeParse({
        to: 'not-an-email',
        subject: 'Welcome',
        template: 'welcome',
        data: { html: '<p>Hello</p>' },
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty subject', () => {
      const result = emailSendNotificationJobSchema.safeParse({
        to: 'user@example.com',
        subject: '',
        template: 'welcome',
        data: {},
      });
      expect(result.success).toBe(false);
    });
  });

  describe('docGeneratePlanJobSchema', () => {
    it('should accept valid doc job data', () => {
      const result = docGeneratePlanJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        roomId: '660e8400-e29b-41d4-a716-446655440000',
        format: 'pdf',
      });
      expect(result.success).toBe(true);
    });

    it('should accept html format', () => {
      const result = docGeneratePlanJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        roomId: '660e8400-e29b-41d4-a716-446655440000',
        format: 'html',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid format', () => {
      const result = docGeneratePlanJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        roomId: '660e8400-e29b-41d4-a716-446655440000',
        format: 'docx',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('renderGenerateJobSchema', () => {
    // Schema now requires mode: 'edit_existing' | 'from_scratch'
    // and uses baseImageUrl (URL) instead of baseAssetId (UUID)

    it('should accept valid render job data (from_scratch)', () => {
      const result = renderGenerateJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        roomId: '660e8400-e29b-41d4-a716-446655440000',
        mode: 'from_scratch',
        prompt: 'Modern kitchen with marble countertops',
        assetId: '770e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid render job data (edit_existing with baseImageUrl)', () => {
      const result = renderGenerateJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        roomId: '660e8400-e29b-41d4-a716-446655440000',
        mode: 'edit_existing',
        prompt: 'Renovate this kitchen in japandi style',
        assetId: '770e8400-e29b-41d4-a716-446655440000',
        baseImageUrl: 'https://storage.example.com/rooms/kitchen.jpg',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing mode', () => {
      const result = renderGenerateJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        roomId: '660e8400-e29b-41d4-a716-446655440000',
        prompt: 'Modern kitchen',
        assetId: '770e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid mode value', () => {
      const result = renderGenerateJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        roomId: '660e8400-e29b-41d4-a716-446655440000',
        mode: 'invalid_mode',
        prompt: 'Modern kitchen',
        assetId: '770e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty prompt', () => {
      const result = renderGenerateJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        roomId: '660e8400-e29b-41d4-a716-446655440000',
        mode: 'from_scratch',
        prompt: '',
        assetId: '770e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(false);
    });

    it('should reject prompt over 5000 chars', () => {
      const result = renderGenerateJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        roomId: '660e8400-e29b-41d4-a716-446655440000',
        mode: 'from_scratch',
        prompt: 'x'.repeat(5001),
        assetId: '770e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('aiProcessMessageJobSchema', () => {
    it('should accept valid AI job data', () => {
      const result = aiProcessMessageJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'I want to renovate my kitchen',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional userId', () => {
      const result = aiProcessMessageJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'Help me',
        userId: '880e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userId).toBe('880e8400-e29b-41d4-a716-446655440000');
      }
    });

    it('should reject empty content', () => {
      const result = aiProcessMessageJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        content: '',
      });
      expect(result.success).toBe(false);
    });
  });
});
