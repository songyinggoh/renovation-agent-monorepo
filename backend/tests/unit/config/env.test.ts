import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// Prevent dotenv from loading .env files during tests
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

/**
 * Helper: set process.env to the given vars, reset modules, then dynamically
 * import env.ts so `loadEnv()` re-runs with the new process.env.
 */
async function loadEnvWith(overrides: Record<string, string | undefined>) {
  // Start from a minimal valid set
  const base: Record<string, string> = {
    NODE_ENV: 'test',
    PORT: '3000',
    DATABASE_URL: 'postgresql://localhost:5432/test',
    GOOGLE_API_KEY: 'test-key-123',
    FRONTEND_URL: 'http://localhost:3001',
  };

  // Wipe env vars that the schema cares about
  const allKeys = [
    ...Object.keys(base),
    ...Object.keys(overrides),
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'REDIS_URL',
    'SENTRY_DSN',
    'LOG_LEVEL',
    'LANGGRAPH_CHECKPOINTER',
    'OTEL_ENABLED',
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    'OTEL_EXPORTER_OTLP_HEADERS',
    'OTEL_TRACES_SAMPLER_ARG',
    'RESEND_API_KEY',
    'PDF_GENERATION_ENABLED',
    'IMAGE_GENERATION_PROVIDER',
    'STABILITY_API_KEY',
    'ANTHROPIC_API_KEY',
    'SHUTDOWN_TIMEOUT_MS',
  ];
  for (const key of allKeys) {
    delete process.env[key];
  }

  // Apply base + overrides
  for (const [k, v] of Object.entries({ ...base, ...overrides })) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }

  vi.resetModules();
  return import('../../../src/config/env.js');
}

describe('env.ts', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    // Restore original env to avoid cross-test contamination
    process.env = { ...savedEnv };
    vi.resetModules();
  });

  // ── Schema validation ───────────────────────────────────────

  describe('schema validation', () => {
    it('should load successfully with all required vars', async () => {
      const mod = await loadEnvWith({});
      expect(mod.env).toBeDefined();
      expect(mod.env.NODE_ENV).toBe('test');
      expect(mod.env.PORT).toBe(3000);
      expect(mod.env.DATABASE_URL).toBe('postgresql://localhost:5432/test');
      expect(mod.env.GOOGLE_API_KEY).toBe('test-key-123');
    });

    it('should throw when DATABASE_URL is missing', async () => {
      await expect(
        loadEnvWith({ DATABASE_URL: undefined }),
      ).rejects.toThrow('Environment validation failed');
    });

    it('should throw when GOOGLE_API_KEY is missing', async () => {
      await expect(
        loadEnvWith({ GOOGLE_API_KEY: undefined }),
      ).rejects.toThrow('Environment validation failed');
    });

    it('should throw when DATABASE_URL is not a valid URL', async () => {
      await expect(
        loadEnvWith({ DATABASE_URL: 'not-a-url' }),
      ).rejects.toThrow('Environment validation failed');
    });

    it('should throw when GOOGLE_API_KEY is empty string', async () => {
      await expect(
        loadEnvWith({ GOOGLE_API_KEY: '' }),
      ).rejects.toThrow('Environment validation failed');
    });

    it('should throw when NODE_ENV is an invalid value', async () => {
      await expect(
        loadEnvWith({ NODE_ENV: 'staging' }),
      ).rejects.toThrow('Environment validation failed');
    });

    it('should throw when PORT is not a number', async () => {
      await expect(
        loadEnvWith({ PORT: 'abc' }),
      ).rejects.toThrow('Environment validation failed');
    });

    it('should throw when PORT is negative', async () => {
      await expect(
        loadEnvWith({ PORT: '-1' }),
      ).rejects.toThrow('Environment validation failed');
    });

    it('should throw when FRONTEND_URL is not a valid URL', async () => {
      await expect(
        loadEnvWith({ FRONTEND_URL: 'not-a-url' }),
      ).rejects.toThrow('Environment validation failed');
    });
  });

  // ── Default values ──────────────────────────────────────────

  describe('defaults', () => {
    it('should default NODE_ENV to development when unset', async () => {
      const mod = await loadEnvWith({ NODE_ENV: undefined });
      expect(mod.env.NODE_ENV).toBe('development');
    });

    it('should default PORT to 3000', async () => {
      const mod = await loadEnvWith({ PORT: undefined });
      expect(mod.env.PORT).toBe(3000);
    });

    it('should default FRONTEND_URL to http://localhost:3001', async () => {
      const mod = await loadEnvWith({ FRONTEND_URL: undefined });
      expect(mod.env.FRONTEND_URL).toBe('http://localhost:3001');
    });

    it('should default LOG_LEVEL to info', async () => {
      const mod = await loadEnvWith({});
      expect(mod.env.LOG_LEVEL).toBe('info');
    });

    it('should default LANGGRAPH_CHECKPOINTER to memory', async () => {
      const mod = await loadEnvWith({});
      expect(mod.env.LANGGRAPH_CHECKPOINTER).toBe('memory');
    });

    it('should default REDIS_URL to redis://localhost:6379', async () => {
      const mod = await loadEnvWith({});
      expect(mod.env.REDIS_URL).toBe('redis://localhost:6379');
    });

    it('should default OTEL_ENABLED to true', async () => {
      const mod = await loadEnvWith({});
      expect(mod.env.OTEL_ENABLED).toBe(true);
    });

    it('should default SHUTDOWN_TIMEOUT_MS to 10000', async () => {
      const mod = await loadEnvWith({});
      expect(mod.env.SHUTDOWN_TIMEOUT_MS).toBe(10000);
    });

    it('should default PDF_GENERATION_ENABLED to true', async () => {
      const mod = await loadEnvWith({});
      expect(mod.env.PDF_GENERATION_ENABLED).toBe(true);
    });

    it('should default IMAGE_GENERATION_PROVIDER to gemini', async () => {
      const mod = await loadEnvWith({});
      expect(mod.env.IMAGE_GENERATION_PROVIDER).toBe('gemini');
    });
  });

  // ── Coercion & transforms ──────────────────────────────────

  describe('coercion and transforms', () => {
    it('should coerce PORT string to number', async () => {
      const mod = await loadEnvWith({ PORT: '8080' });
      expect(mod.env.PORT).toBe(8080);
      expect(typeof mod.env.PORT).toBe('number');
    });

    it('should transform OTEL_ENABLED "true" to boolean true', async () => {
      const mod = await loadEnvWith({ OTEL_ENABLED: 'true' });
      expect(mod.env.OTEL_ENABLED).toBe(true);
    });

    it('should transform OTEL_ENABLED "false" to boolean false', async () => {
      const mod = await loadEnvWith({ OTEL_ENABLED: 'false' });
      expect(mod.env.OTEL_ENABLED).toBe(false);
    });

    it('should transform PDF_GENERATION_ENABLED "false" to boolean false', async () => {
      const mod = await loadEnvWith({ PDF_GENERATION_ENABLED: 'false' });
      expect(mod.env.PDF_GENERATION_ENABLED).toBe(false);
    });

    it('should coerce OTEL_TRACES_SAMPLER_ARG to number', async () => {
      const mod = await loadEnvWith({ OTEL_TRACES_SAMPLER_ARG: '0.5' });
      expect(mod.env.OTEL_TRACES_SAMPLER_ARG).toBe(0.5);
    });

    it('should reject OTEL_TRACES_SAMPLER_ARG > 1', async () => {
      await expect(
        loadEnvWith({ OTEL_TRACES_SAMPLER_ARG: '1.5' }),
      ).rejects.toThrow('Environment validation failed');
    });

    it('should reject OTEL_TRACES_SAMPLER_ARG < 0', async () => {
      await expect(
        loadEnvWith({ OTEL_TRACES_SAMPLER_ARG: '-0.1' }),
      ).rejects.toThrow('Environment validation failed');
    });

    it('should coerce SHUTDOWN_TIMEOUT_MS string to number', async () => {
      const mod = await loadEnvWith({ SHUTDOWN_TIMEOUT_MS: '5000' });
      expect(mod.env.SHUTDOWN_TIMEOUT_MS).toBe(5000);
    });
  });

  // ── OTLP headers validation ────────────────────────────────

  describe('OTEL_EXPORTER_OTLP_HEADERS validation', () => {
    it('should accept valid key=value header', async () => {
      const mod = await loadEnvWith({
        OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Bearer token123',
      });
      expect(mod.env.OTEL_EXPORTER_OTLP_HEADERS).toBe(
        'Authorization=Bearer token123',
      );
    });

    it('should accept multiple comma-separated headers', async () => {
      const mod = await loadEnvWith({
        OTEL_EXPORTER_OTLP_HEADERS: 'X-Api-Key=abc,X-Org=myorg',
      });
      expect(mod.env.OTEL_EXPORTER_OTLP_HEADERS).toBe(
        'X-Api-Key=abc,X-Org=myorg',
      );
    });

    it('should reject header with CRLF injection', async () => {
      await expect(
        loadEnvWith({
          OTEL_EXPORTER_OTLP_HEADERS: 'X-Key=val\r\nEvil: injected',
        }),
      ).rejects.toThrow('Environment validation failed');
    });

    it('should reject header with missing key', async () => {
      await expect(
        loadEnvWith({ OTEL_EXPORTER_OTLP_HEADERS: '=value' }),
      ).rejects.toThrow('Environment validation failed');
    });

    it('should be optional (undefined when not set)', async () => {
      const mod = await loadEnvWith({});
      expect(mod.env.OTEL_EXPORTER_OTLP_HEADERS).toBeUndefined();
    });
  });

  // ── Optional fields ─────────────────────────────────────────

  describe('optional fields', () => {
    it('should leave SUPABASE_URL undefined when not set', async () => {
      const mod = await loadEnvWith({});
      expect(mod.env.SUPABASE_URL).toBeUndefined();
    });

    it('should accept valid SUPABASE_URL', async () => {
      const mod = await loadEnvWith({
        SUPABASE_URL: 'https://abc.supabase.co',
      });
      expect(mod.env.SUPABASE_URL).toBe('https://abc.supabase.co');
    });

    it('should reject invalid SUPABASE_URL', async () => {
      await expect(
        loadEnvWith({ SUPABASE_URL: 'not-a-url' }),
      ).rejects.toThrow('Environment validation failed');
    });

    it('should leave STRIPE_SECRET_KEY undefined when not set', async () => {
      const mod = await loadEnvWith({});
      expect(mod.env.STRIPE_SECRET_KEY).toBeUndefined();
    });

    it('should leave SENTRY_DSN undefined when not set', async () => {
      const mod = await loadEnvWith({});
      expect(mod.env.SENTRY_DSN).toBeUndefined();
    });

    it('should reject invalid SENTRY_DSN', async () => {
      await expect(
        loadEnvWith({ SENTRY_DSN: 'not-a-url' }),
      ).rejects.toThrow('Environment validation failed');
    });
  });

  // ── Helper functions ────────────────────────────────────────

  describe('isAuthEnabled', () => {
    it('should return false when no Supabase vars set', async () => {
      const mod = await loadEnvWith({});
      expect(mod.isAuthEnabled()).toBe(false);
    });

    it('should return false when only SUPABASE_URL set', async () => {
      const mod = await loadEnvWith({
        SUPABASE_URL: 'https://abc.supabase.co',
      });
      expect(mod.isAuthEnabled()).toBe(false);
    });

    it('should return true when all 3 Supabase vars set', async () => {
      const mod = await loadEnvWith({
        SUPABASE_URL: 'https://abc.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      });
      expect(mod.isAuthEnabled()).toBe(true);
    });
  });

  describe('isPaymentsEnabled', () => {
    it('should return false when no Stripe vars set', async () => {
      const mod = await loadEnvWith({});
      expect(mod.isPaymentsEnabled()).toBe(false);
    });

    it('should return false when only STRIPE_SECRET_KEY set', async () => {
      const mod = await loadEnvWith({
        STRIPE_SECRET_KEY: 'sk_test_123',
      });
      expect(mod.isPaymentsEnabled()).toBe(false);
    });

    it('should return true when both Stripe vars set', async () => {
      const mod = await loadEnvWith({
        STRIPE_SECRET_KEY: 'sk_test_123',
        STRIPE_WEBHOOK_SECRET: 'whsec_123',
      });
      expect(mod.isPaymentsEnabled()).toBe(true);
    });
  });

  describe('isStorageEnabled', () => {
    it('should return false when auth is not enabled', async () => {
      const mod = await loadEnvWith({});
      expect(mod.isStorageEnabled()).toBe(false);
    });

    it('should return true when auth is enabled (bucket has default)', async () => {
      const mod = await loadEnvWith({
        SUPABASE_URL: 'https://abc.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      });
      expect(mod.isStorageEnabled()).toBe(true);
    });
  });

  describe('isPostgresCheckpointerEnabled', () => {
    it('should return false with default memory checkpointer', async () => {
      const mod = await loadEnvWith({});
      expect(mod.isPostgresCheckpointerEnabled()).toBe(false);
    });

    it('should return true when LANGGRAPH_CHECKPOINTER is postgres', async () => {
      const mod = await loadEnvWith({
        LANGGRAPH_CHECKPOINTER: 'postgres',
      });
      expect(mod.isPostgresCheckpointerEnabled()).toBe(true);
    });
  });

  describe('isEmailEnabled', () => {
    it('should return false when RESEND_API_KEY not set', async () => {
      const mod = await loadEnvWith({});
      expect(mod.isEmailEnabled()).toBe(false);
    });

    it('should return true when RESEND_API_KEY is set', async () => {
      const mod = await loadEnvWith({ RESEND_API_KEY: 're_123' });
      expect(mod.isEmailEnabled()).toBe(true);
    });
  });

  describe('isPdfEnabled', () => {
    it('should return true by default', async () => {
      const mod = await loadEnvWith({});
      expect(mod.isPdfEnabled()).toBe(true);
    });

    it('should return false when PDF_GENERATION_ENABLED is false', async () => {
      const mod = await loadEnvWith({ PDF_GENERATION_ENABLED: 'false' });
      expect(mod.isPdfEnabled()).toBe(false);
    });
  });

  describe('isTelemetryEnabled', () => {
    it('should return true by default', async () => {
      const mod = await loadEnvWith({});
      expect(mod.isTelemetryEnabled()).toBe(true);
    });

    it('should return false when OTEL_ENABLED is false', async () => {
      const mod = await loadEnvWith({ OTEL_ENABLED: 'false' });
      expect(mod.isTelemetryEnabled()).toBe(false);
    });
  });

  describe('isImageGenerationEnabled', () => {
    it('should return true with default gemini provider', async () => {
      const mod = await loadEnvWith({});
      expect(mod.isImageGenerationEnabled()).toBe(true);
    });

    it('should return true when stability provider with API key', async () => {
      const mod = await loadEnvWith({
        IMAGE_GENERATION_PROVIDER: 'stability',
        STABILITY_API_KEY: 'sk-stab-123',
      });
      expect(mod.isImageGenerationEnabled()).toBe(true);
    });

    it('should return false when stability provider without API key', async () => {
      const mod = await loadEnvWith({
        IMAGE_GENERATION_PROVIDER: 'stability',
      });
      expect(mod.isImageGenerationEnabled()).toBe(false);
    });
  });

  describe('isDevAgentEnabled', () => {
    it('should return false when ANTHROPIC_API_KEY not set', async () => {
      const mod = await loadEnvWith({});
      expect(mod.isDevAgentEnabled()).toBe(false);
    });

    it('should return true when ANTHROPIC_API_KEY is set', async () => {
      const mod = await loadEnvWith({ ANTHROPIC_API_KEY: 'sk-ant-123' });
      expect(mod.isDevAgentEnabled()).toBe(true);
    });
  });
});
