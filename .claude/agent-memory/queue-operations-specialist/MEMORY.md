# Queue Operations Specialist — Memory

## Key Architecture Facts (verified 2026-02-21)

### Worker Pattern (reference: email.worker.ts, image.worker.ts)
- All workers use `createWorker(jobName, processor)` from `backend/src/config/queue.ts`
- No raw BullMQ Worker instantiation — always go through the factory
- Zod schema validation at processor entry → `UnrecoverableError` on failure
- Feature guards (e.g. `isEmailEnabled()`) checked before doing real work
- Socket.io progress emitted via `emitToSession()` from `backend/src/utils/socket-emitter.js`
- Logger: `new Logger({ serviceName: 'XyzWorker' })` with `{ jobId, sessionId, ... }` context

### Worker Profiles (WORKER_PROFILES in queue.ts)
| Job | Concurrency | lockDuration | timeoutMs | Attempts | Rate Limit |
|-----|-------------|-------------|-----------|----------|------------|
| image:optimize | 2 | 60s | 30s | 3 | none |
| email:send-notification | 2 | 30s | 15s | 3 | 10/sec |
| doc:generate-plan | 1 | 180s | 120s | 3 | none |
| render:generate | 1 | 120s | 90s | 3 | 5/min |
| ai:process-message | 3 | 60s | 45s | 3 | none |

### Shutdown Registration (server.ts — already complete)
- All 4 workers (email, image, doc, render) registered in `setupGracefulShutdown()`
- Single `Workers & Queues` resource runs `Promise.allSettled(workers.map(w => w!.close()))`
  then `closeQueues()`. Timeout: 5000ms.
- Redis cleanup registered after workers (correct order)

### OTel Tracing in Workers
- No dedicated OTel import in workers yet — the project traces via auto-instrumentation
- `RenovationSampler` always samples spans starting with `ai.` or containing `gemini`
- To add manual job spans: import `trace` from `@opentelemetry/api`, use
  `tracer.startActiveSpan('job:render:generate', { attributes: { 'job.id': job.id } }, ...)`
- See `backend/src/config/telemetry.ts` for sampler logic

### Dead Letter Queue
- Handled automatically by `createWorker` event handler in `queue.ts`
- `moveToDeadLetter(job, err.message, queueName)` called when `attemptsMade >= attempts`
- Workers do NOT need to call this themselves

### Render Worker Specific (render.worker.ts)
- Uses `withTimeout(adapter.generate(...), profile.timeoutMs, description)` for app-level timeout
- On final attempt: calls `renderService.failRender(assetId, errorMessage)` then emits `render:failed`
- Does NOT catch `UnrecoverableError` before retry classification — permanent errors just rethrow
- Socket.io events: `render:started` (entry), `render:complete` (success), `render:failed` (final failure)
- Image generation adapter is created per-job call (stateless factory pattern)

### Gaps / Improvement Opportunities
- render.worker.ts lacks OTel manual spans — high value for 10-60s jobs
- render.worker.ts lacks `job.updateProgress()` calls — clients see no progress between start/done
- `render:generate` rate limiter is 5/min but queue `attempts:3` are set at enqueue time in
  RenderService.requestRender() — these are duplicated vs WORKER_PROFILES defaultJobOptions
- `renderService` is module-level singleton in render.worker.ts — fine for now
- `createImageGenerationAdapter()` is called per job — causes a new GoogleGenAI client per render

## Detailed Notes
- See `worker-patterns.md` for error classification patterns
- See `render-worker-analysis.md` for render worker specific analysis
