import { z } from 'zod';
import dotenv from 'dotenv';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'EnvConfig' });

/**
 * Environment configuration schema for Phases 1-7 (Core Features)
 *
 * REQUIRED for Phases 1-7:
 * - NODE_ENV, PORT, DATABASE_URL, GOOGLE_API_KEY, FRONTEND_URL
 *
 * OPTIONAL until Phase 8 (Authentication):
 * - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * OPTIONAL until Phase 9 (Payments):
 * - STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 */
const envSchema = z.object({
  // ============================================
  // Application Settings
  // ============================================
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // ============================================
  // Frontend Configuration
  // ============================================
  FRONTEND_URL: z.string().url().default('http://localhost:3001'),

  // ============================================
  // Database Configuration (REQUIRED)
  // ============================================
  DATABASE_URL: z.string().url(),

  // ============================================
  // Google Gemini API (REQUIRED for Phases 1-7)
  // ============================================
  GOOGLE_API_KEY: z.string().min(1, 'GOOGLE_API_KEY is required for AI features'),

  // ============================================
  // Logging Configuration
  // ============================================
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('info'),

  // ============================================
  // LangGraph Checkpointer (Phase 1.3)
  // ============================================
  LANGGRAPH_CHECKPOINTER: z
    .enum(['memory', 'postgres'])
    .default('memory'),

  // ============================================
  // Supabase Authentication (OPTIONAL - Phase 8)
  // ============================================
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // ============================================
  // Supabase Storage (OPTIONAL - Phase 2.1)
  // ============================================
  SUPABASE_STORAGE_BUCKET: z.string().default('room-assets'),
  SUPABASE_STYLE_BUCKET: z.string().default('style-assets'),

  // ============================================
  // Redis Configuration (Phase 3: Production Safety)
  // ============================================
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // ============================================
  // Sentry Error Tracking (Phase 3: Production Safety)
  // ============================================
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),

  // ============================================
  // Email / Resend (Phase III: Communication)
  // ============================================
  RESEND_API_KEY: z.string().optional(),
  // FROM_EMAIL accepts RFC 5322 format: "Display Name <email@domain.com>" or plain email
  FROM_EMAIL: z.string().default('Renovation Agent <noreply@renovationagent.com>'),

  // ============================================
  // OpenTelemetry (Phase IV: Observability)
  // ============================================
  OTEL_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  OTEL_SERVICE_NAME: z.string().default('renovation-agent-backend'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z
    .string()
    .url()
    .optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z
    .string()
    .refine(
      (val) =>
        val.split(',').every((pair) => {
          const eqIdx = pair.indexOf('=');
          if (eqIdx <= 0) return false;
          const key = pair.slice(0, eqIdx);
          // Block CRLF injection and validate header name (RFC 7230)
          return !/[\r\n]/.test(pair) && /^[a-zA-Z0-9!#$%&'*+\-.^_`|~]+$/.test(key.trim());
        }),
      { message: 'Invalid OTLP header format' },
    )
    .optional(),
  OTEL_TRACES_SAMPLER_ARG: z.coerce.number().min(0).max(1).default(0.1),
  OTEL_LOG_LEVEL: z
    .enum(['none', 'error', 'warn', 'info', 'debug', 'verbose', 'all'])
    .default('info'),

  // ============================================
  // PDF Generation (Phase 3: Documents)
  // ============================================
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
  PDF_GENERATION_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // ============================================
  // AI Image Generation (Phase 3.2: Room Renders)
  // ============================================
  IMAGE_GENERATION_PROVIDER: z
    .enum(['gemini', 'stability'])
    .default('gemini'),
  STABILITY_API_KEY: z.string().optional(),

  // ============================================
  // Stripe Payment Integration (OPTIONAL - Phase 9)
  // ============================================
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

/**
 * Validated environment variables type
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Load and validate environment variables
 */
function loadEnv(): Env {
  // Load .env file
  dotenv.config();

  logger.info('Loading environment configuration', {
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
  });

  try {
    // Validate environment variables
    const env = envSchema.parse(process.env);

    logger.info('Environment configuration validated successfully', {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      hasGoogleApiKey: !!env.GOOGLE_API_KEY,
      hasDatabaseUrl: !!env.DATABASE_URL,
      hasSupabaseUrl: !!env.SUPABASE_URL,
      hasStripeKey: !!env.STRIPE_SECRET_KEY,
      otelEnabled: env.OTEL_ENABLED,
    });

    // Warn if optional features are not configured
    if (!env.SUPABASE_URL) {
      logger.warn('Supabase authentication not configured (optional for Phases 1-7)');
    }
    if (!env.STRIPE_SECRET_KEY) {
      logger.warn('Stripe payment integration not configured (optional for Phases 1-7)');
    }

    return env;
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      logger.error('Environment validation failed', error as Error, {
        issues: error.issues,
      });

      // Format error message
      const missingVars = error.issues.map((issue) => {
        return `  - ${issue.path.join('.')}: ${issue.message}`;
      });

      throw new Error(
        `Environment validation failed:\n${missingVars.join('\n')}\n\n` +
          'Please check your .env file and ensure all required variables are set.\n' +
          'See .env.example for reference.'
      );
    }

    throw error;
  }
}

/**
 * Singleton environment configuration
 * Loaded once at application startup
 */
export const env = loadEnv();

/**
 * Helper function to check if authentication is configured
 */
export function isAuthEnabled(): boolean {
  return !!(
    env.SUPABASE_URL &&
    env.SUPABASE_ANON_KEY &&
    env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Helper function to check if payments are configured
 */
export function isPaymentsEnabled(): boolean {
  return !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

/**
 * Helper function to check if Supabase Storage is configured
 */
export function isStorageEnabled(): boolean {
  return isAuthEnabled() && !!env.SUPABASE_STORAGE_BUCKET;
}

/**
 * Helper function to check if PostgreSQL checkpointer is enabled
 */
export function isPostgresCheckpointerEnabled(): boolean {
  return env.LANGGRAPH_CHECKPOINTER === 'postgres';
}

/**
 * Helper function to check if email (Resend) is configured
 */
export function isEmailEnabled(): boolean {
  return !!env.RESEND_API_KEY;
}

/**
 * Helper function to check if PDF generation is enabled
 */
export function isPdfEnabled(): boolean {
  return env.PDF_GENERATION_ENABLED;
}

/**
 * Helper function to check if OpenTelemetry is enabled
 */
export function isTelemetryEnabled(): boolean {
  return env.OTEL_ENABLED;
}

/**
 * Helper function to check if AI image generation is configured
 */
export function isImageGenerationEnabled(): boolean {
  return env.IMAGE_GENERATION_PROVIDER === 'gemini' || !!env.STABILITY_API_KEY;
}
