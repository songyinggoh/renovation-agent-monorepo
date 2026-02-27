import { redis } from '../config/redis.js';
import type { CircuitBreakerConfig } from './types.js';

const KILL_SWITCH_PREFIX = 'killswitch:phase:';
const CIRCUIT_BREAKER_PREFIX = 'cb:';

/**
 * Check if a phase is enabled (not killed).
 * Fails open — if Redis is unavailable, phase is considered enabled.
 */
export async function isPhaseEnabled(phase: string): Promise<boolean> {
  try {
    const value = await redis.get(`${KILL_SWITCH_PREFIX}${phase}`);
    return value !== 'disabled';
  } catch {
    // Fail open — allow phase to run if Redis is down
    return true;
  }
}

/**
 * Disable a phase via kill switch. TTL auto-expires.
 */
export async function disablePhase(phase: string, ttlSeconds = 86400): Promise<void> {
  await redis.set(`${KILL_SWITCH_PREFIX}${phase}`, 'disabled', 'EX', ttlSeconds);
}

/**
 * Re-enable a phase by removing the kill switch key.
 */
export async function enablePhase(phase: string): Promise<void> {
  await redis.del(`${KILL_SWITCH_PREFIX}${phase}`);
}

/**
 * Circuit breaker — sliding window rate limit per phase:tool pair.
 * Returns true if the call is allowed, false if the breaker has tripped.
 * Fails open — if Redis is unavailable, the call is allowed.
 */
/**
 * Lua script for atomic INCR + EXPIRE.
 * Prevents TTL-less keys if the process crashes between INCR and EXPIRE.
 */
const INCR_WITH_EXPIRE_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

export async function checkCircuitBreaker(
  phase: string,
  tool: string,
  config: CircuitBreakerConfig,
): Promise<boolean> {
  try {
    const key = `${CIRCUIT_BREAKER_PREFIX}${phase}:${tool}`;
    // Atomic INCR + conditional EXPIRE via Lua to prevent orphaned keys
    // redis.eval is ioredis's method for executing server-side Lua scripts
    const count = await redis.eval(
      INCR_WITH_EXPIRE_LUA,
      1,
      key,
      config.windowSeconds,
    ) as number;
    return count <= config.maxCalls;
  } catch {
    // Fail open
    return true;
  }
}
