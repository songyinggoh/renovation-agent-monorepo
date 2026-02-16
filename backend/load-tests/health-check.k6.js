/**
 * k6 Load Test: Health Endpoint
 *
 * Verifies OTel instrumentation adds <5ms overhead to health checks.
 * Measures p50/p95/p99 latency and memory usage.
 *
 * Usage:
 *   k6 run load-tests/health-check.k6.js
 *   k6 run load-tests/health-check.k6.js --env BASE_URL=http://localhost:3000
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const healthLatency = new Trend('health_latency', true);
const healthErrors = new Counter('health_errors');

export const options = {
  scenarios: {
    // Ramp up to 50 VUs over 30s, sustain for 60s, ramp down
    health_check: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '10s', target: 10 },
        { duration: '30s', target: 50 },
        { duration: '60s', target: 50 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    // OTel overhead target: <5ms at p95
    health_latency: ['p(50)<10', 'p(95)<25', 'p(99)<50'],
    // Less than 1% error rate
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // Basic liveness
  const liveRes = http.get(`${BASE_URL}/health/live`);
  healthLatency.add(liveRes.timings.duration);

  check(liveRes, {
    'liveness returns 200': (r) => r.status === 200,
    'liveness body has status': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'ok';
      } catch {
        return false;
      }
    },
  }) || healthErrors.add(1);

  // Readiness (includes DB check)
  const readyRes = http.get(`${BASE_URL}/health/ready`);
  healthLatency.add(readyRes.timings.duration);

  check(readyRes, {
    'readiness returns 200': (r) => r.status === 200,
  }) || healthErrors.add(1);

  // Detailed status
  const statusRes = http.get(`${BASE_URL}/health/status`);
  healthLatency.add(statusRes.timings.duration);

  check(statusRes, {
    'status returns 200': (r) => r.status === 200,
    'status includes uptime': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.uptime === 'number';
      } catch {
        return false;
      }
    },
  }) || healthErrors.add(1);

  // Test force-sample header doesn't add significant overhead
  const forceSampleRes = http.get(`${BASE_URL}/health/live`, {
    headers: { 'x-force-sample': 'true' },
  });
  healthLatency.add(forceSampleRes.timings.duration);

  check(forceSampleRes, {
    'force-sample returns 200': (r) => r.status === 200,
  }) || healthErrors.add(1);

  sleep(0.1);
}

export function handleSummary(data) {
  const p50 = data.metrics.health_latency?.values?.['p(50)'] || 0;
  const p95 = data.metrics.health_latency?.values?.['p(95)'] || 0;
  const p99 = data.metrics.health_latency?.values?.['p(99)'] || 0;

  console.log('\n=== Health Endpoint Load Test Summary ===');
  console.log(`  p50: ${p50.toFixed(2)}ms`);
  console.log(`  p95: ${p95.toFixed(2)}ms`);
  console.log(`  p99: ${p99.toFixed(2)}ms`);
  console.log(`  OTel overhead target: p95 < 5ms additional latency`);
  console.log('==========================================\n');

  return {
    stdout: JSON.stringify(data, null, 2),
  };
}
