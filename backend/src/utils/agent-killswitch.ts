import { redis } from '../config/redis.js';
import { Logger } from './logger.js';

const logger = new Logger({ serviceName: 'AgentKillSwitch' });

const KEY_PREFIX = 'agent:';
const KEY_SUFFIX = ':enabled';

function agentKey(agentId: string): string {
  return `${KEY_PREFIX}${agentId}${KEY_SUFFIX}`;
}

/**
 * Check if an agent is enabled before executing.
 * Key format: agent:{agentId}:enabled
 * Default: enabled (returns true if key does not exist)
 * Graceful degradation: returns true if Redis unavailable
 */
export async function isAgentEnabled(agentId: string): Promise<boolean> {
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
  try {
    await redis.set(agentKey(agentId), 'false', 'EX', ttlSeconds);
    logger.info('Agent disabled', { agentId, ttlSeconds });
  } catch (err) {
    logger.error('Failed to disable agent via Redis', err as Error, { agentId });
    throw err;
  }
}

/**
 * Re-enable an agent by setting its key to 'true'.
 */
export async function enableAgent(agentId: string): Promise<void> {
  try {
    await redis.set(agentKey(agentId), 'true');
    logger.info('Agent enabled', { agentId });
  } catch (err) {
    logger.error('Failed to enable agent via Redis', err as Error, { agentId });
    throw err;
  }
}
