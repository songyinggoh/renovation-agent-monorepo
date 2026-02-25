import { redis } from '../config/redis.js';
import { Logger } from './logger.js';

const logger = new Logger({ serviceName: 'AgentKillSwitch' });

const KEY_PREFIX = 'agent:';
const KEY_SUFFIX = ':enabled';
const AGENT_ID_PATTERN = /^[a-z0-9-]+$/;

function agentKey(agentId: string): string {
  return `${KEY_PREFIX}${agentId}${KEY_SUFFIX}`;
}

function validateAgentId(agentId: string): void {
  if (!agentId || agentId.length > 128 || !AGENT_ID_PATTERN.test(agentId)) {
    throw new Error(
      `Invalid agentId: "${agentId}" — must be 1-128 lowercase alphanumeric/hyphen characters`
    );
  }
}

/**
 * Check if an agent is enabled before executing.
 * Key format: agent:{agentId}:enabled
 * Default: enabled (returns true if key does not exist)
 * Graceful degradation: returns true if Redis unavailable
 */
export async function isAgentEnabled(agentId: string): Promise<boolean> {
  validateAgentId(agentId);
  try {
    const value = await redis.get(agentKey(agentId));
    if (value === null) return true; // key absent = enabled by default
    return value === 'true';
  } catch (err) {
    logger.warn(
      'Redis unavailable for kill switch check — defaulting to enabled',
      err as Error,
      { agentId },
    );
    return true;
  }
}

/**
 * Disable an agent. Call from admin endpoint or ops script.
 * TTL: 24 hours auto-expiry by default (prevents permanent lockout from forgotten flags).
 */
export async function disableAgent(agentId: string, ttlSeconds = 86400): Promise<void> {
  validateAgentId(agentId);
  try {
    await redis.set(agentKey(agentId), 'false', 'EX', ttlSeconds);
    logger.info('Agent disabled', { agentId, ttlSeconds });
  } catch (err) {
    logger.error('Failed to disable agent via Redis', err as Error, { agentId });
    throw err;
  }
}

/**
 * Re-enable an agent by removing its kill switch key.
 * Since absent key = enabled (default), deleting is cleaner than setting 'true'.
 */
export async function enableAgent(agentId: string): Promise<void> {
  validateAgentId(agentId);
  try {
    await redis.del(agentKey(agentId));
    logger.info('Agent enabled (key removed)', { agentId });
  } catch (err) {
    logger.error('Failed to enable agent via Redis', err as Error, { agentId });
    throw err;
  }
}
