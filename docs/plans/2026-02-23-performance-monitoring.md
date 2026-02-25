# Iteration 32: Performance Optimization & Monitoring Enhancement

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add request timing middleware, metrics collection, health check fixes, cache stampede protection, and a server-side vitals ingestion endpoint — making the platform observable and resilient under load.

**Architecture:** 6 tasks in dependency order. T1 adds the core request-timing middleware that all subsequent tasks depend on. T2 fixes the health check Redis leak. T3 adds cache stampede protection. T4 adds the vitals ingestion endpoint. T5 adds missing DB indexes. T6 adds i18n keys and runs final verification. Tasks 2-5 are independent of each other (can be parallelized after T1).

**Tech Stack:** TypeScript, Hono.js middleware, Redis (v5), Drizzle ORM, PostgreSQL, Vitest

---

### Task 1: Request timing middleware + X-Response-Time header

**Files:**
- Create: `src/server/middleware/request-timing.ts`
- Create: `src/server/middleware/request-timing.spec.ts`
- Modify: `src/server/index.ts` (add middleware registration after requestIdMiddleware)

**What to do:**

Create a Hono middleware that:
1. Records `Date.now()` before `await next()`
2. Calculates duration after `next()` returns
3. Sets `X-Response-Time` header (e.g., `"42ms"`)
4. Calls `logRequestWithId(c, method, path, status, duration)` from `request-id.ts`
5. Logs slow requests (>1000ms) at warn level

```ts
// src/server/middleware/request-timing.ts
import { Context, Next } from 'hono';
import { logRequestWithId } from './request-id';

const SLOW_REQUEST_THRESHOLD_MS = 1000;

export async function requestTimingMiddleware(c: Context, next: Next) {
  const start = Date.now();

  await next();

  const duration = Date.now() - start;
  c.header('X-Response-Time', `${duration}ms`);

  // Log request with timing
  logRequestWithId(c, c.req.method, c.req.path, c.res.status, duration);

  // Warn on slow requests
  if (duration > SLOW_REQUEST_THRESHOLD_MS) {
    const logger = c.get('logger');
    if (logger) {
      logger.warn('Slow request detected', {
        http: { method: c.req.method, path: c.req.path, status: c.res.status, duration },
      });
    }
  }
}
```

**Tests** (`request-timing.spec.ts`): ~6 tests
- Sets X-Response-Time header on response
- Header format is `"Nms"` where N is a non-negative integer
- Calls logRequestWithId with correct args (mock it)
- Logs warning for requests exceeding threshold
- Does not log warning for fast requests
- Works when logger is not set in context

**Registration in `src/server/index.ts`:**
```ts
import { requestTimingMiddleware } from './middleware/request-timing';
// ... after requestIdMiddleware line (~line 90):
app.use('*', requestTimingMiddleware);
```

Place it right after `requestIdMiddleware` and before `logger()` (the hono/logger). This ensures the request ID and child logger are available, and the timing wraps all downstream middleware.

**Commit:** `feat(perf): add request timing middleware with X-Response-Time header`

---

### Task 2: Fix health check Redis connection leak

**Files:**
- Modify: `src/server/services/health.ts` (readinessCheck function, lines 153-190)
- Modify: `src/server/services/health.spec.ts` (if exists, otherwise create)

**What to do:**

The `readinessCheck()` function creates a **new Redis client** on every call (`createClient()` + `connect()`), which leaks connections. Fix it to reuse the singleton from `src/core/redis.ts`.

Replace the Redis check block (lines 153-190) with:

```ts
// Check Redis connection
try {
  const redisStart = Date.now();
  const client = await getRedisClient();
  await client.ping();
  const redisLatency = Date.now() - redisStart;
  const memoryInfo = await client.info('memory').then((info: string) => {
    const match = info.match(/used_memory_human:([^\r\n]+)/);
    return match ? match[1] : undefined;
  });

  checks.redis = {
    status: 'ok',
    latency: redisLatency,
    details: {
      connected: true,
      memory_usage: memoryInfo,
    },
  };
} catch (error) {
  // ... same error handling as before
}
```

Import `getRedisClient` from `@/core/redis` instead of `createClient` from `redis`. Remove the `createClient` import entirely.

**Tests**: ~4 tests
- readinessCheck uses singleton Redis client (not createClient)
- readinessCheck returns redis latency
- readinessCheck returns degraded when Redis fails
- readinessCheck returns error when DB fails

**Commit:** `fix(health): reuse Redis singleton in readiness check to prevent connection leak`

---

### Task 3: Cache stampede protection (singleflight pattern)

**Files:**
- Modify: `src/server/services/cache.service.ts` (enhance `getOrSet` method)
- Modify: `src/server/services/cache.service.spec.ts` (if exists, otherwise create)

**What to do:**

Add singleflight/coalescing to `getOrSet()` so that concurrent cache misses for the same key only trigger one `fetchFn` call. Other callers wait for the in-flight promise.

```ts
// Add to CacheService class:
private readonly inflightRequests = new Map<string, Promise<unknown>>();

async getOrSet<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number = this.defaultTTL
): Promise<T> {
  // 1. Check cache first
  const cached = await this.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // 2. Check if there's already an in-flight request for this key
  const inflight = this.inflightRequests.get(key);
  if (inflight) {
    return inflight as Promise<T>;
  }

  // 3. Create the fetch promise and register it
  const fetchPromise = fetchFn()
    .then(async (value) => {
      await this.set(key, value, ttl);
      return value;
    })
    .finally(() => {
      this.inflightRequests.delete(key);
    });

  this.inflightRequests.set(key, fetchPromise);
  return fetchPromise;
}
```

**Tests**: ~5 tests
- Returns cached value without calling fetchFn (existing behavior)
- Calls fetchFn on cache miss and stores result (existing behavior)
- Concurrent calls for same key only invoke fetchFn once (singleflight)
- After fetchFn completes, inflight map is cleaned up
- If fetchFn throws, inflight map is cleaned up and error propagates

**Commit:** `feat(cache): add singleflight protection to getOrSet to prevent cache stampede`

---

### Task 4: Web Vitals ingestion endpoint

**Files:**
- Create: `src/server/routes/vitals.ts`
- Create: `src/server/routes/vitals.spec.ts`
- Modify: `src/server/index.ts` (register route)

**What to do:**

The frontend's `webVitals.ts` sends metrics to `POST /api/v1/analytics/vitals` via `sendBeacon`, but no server-side handler exists. Create a lightweight endpoint that accepts vitals and logs them.

```ts
// src/server/routes/vitals.ts
import { Hono } from 'hono';
import { logger } from '../services/logger.service';

const vitalsLogger = logger.child({ service: 'web-vitals' });

export const vitalsRoutes = new Hono();

vitalsRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { name, value, rating, timestamp, url } = body;

    if (!name || value === undefined) {
      return c.json({ success: false, error: 'Missing name or value' }, 400);
    }

    vitalsLogger.info('Web vital recorded', {
      vital: { name, value, rating, url },
      clientTimestamp: timestamp,
    });

    return c.json({ success: true }, 202);
  } catch {
    return c.json({ success: true }, 202); // Never fail client-side beacon
  }
});
```

Register in `src/server/index.ts`:
```ts
import { vitalsRoutes } from './routes/vitals';
// ... with other route registrations:
app.route('/api/v1/analytics/vitals', vitalsRoutes);
```

This endpoint should NOT require auth (sendBeacon can't send auth headers). Place it before CSRF protection. It should NOT require tenant middleware.

**Tests**: ~4 tests
- POST with valid vitals returns 202
- POST with missing name returns 400
- POST with malformed body returns 202 (graceful)
- Logs vital metric with correct structure

**Commit:** `feat(vitals): add server-side Web Vitals ingestion endpoint`

---

### Task 5: Add missing database indexes

**Files:**
- Create: `src/db/migrations/0024_performance_indexes.sql`
- Modify: `src/db/schema/social.ts` (add index definitions to character_memories if defined there, or the correct schema file)

**What to do:**

The audit found missing indexes that affect query performance:

1. **character_memories**: No indexes at all. Add:
   - `(character_id, user_id)` — used in every memory retrieval query
   - `(source_chat_id)` — used for session-scoped memory queries

2. **characters**: Missing composite index for marketplace sort:
   - `(is_public, download_count)` — used by `ORDER BY download_count DESC` on marketplace

Find where `character_memories` schema is defined (likely `src/db/schema/memories.ts` or `src/db/schema/social.ts`). Add Drizzle index definitions.

Migration SQL:
```sql
-- Performance indexes for Iteration 32
CREATE INDEX IF NOT EXISTS idx_character_memories_char_user
  ON character_memories (character_id, user_id);

CREATE INDEX IF NOT EXISTS idx_character_memories_source_chat
  ON character_memories (source_chat_id);

CREATE INDEX IF NOT EXISTS idx_characters_public_downloads
  ON characters (is_public, download_count DESC);
```

No tests needed for migrations — verify by running `npm run db:generate` or checking that the migration SQL is syntactically valid.

**Commit:** `perf(db): add missing indexes on character_memories and characters tables`

---

### Task 6: i18n + final verification

**Files:**
- Modify: `src/client/locales/en-US.json` (add any new UI strings if needed)
- Modify: `src/client/locales/zh-CN.json` (same)

**What to do:**

1. No new UI components were added in this iteration, so i18n changes are minimal. If the vitals endpoint or timing middleware surface any user-facing strings, add them.

2. Run full verification:
   - `npx vitest run` — expect 1737+ tests passing, 0 failures
   - `npx tsc --noEmit` — expect 0 errors

3. Update `CLAUDE.md` test count if it changed.

**Commit:** `chore: iteration 32 verification — performance optimization & monitoring`

---

## Verification

After all tasks:
- `npx vitest run` — 1737+ tests passing, 0 failures
- `npx tsc --noEmit` — 0 errors
- `X-Response-Time` header present on all API responses
- Health check `/health/ready` no longer creates new Redis connections
- Concurrent `getOrSet` calls for same key only trigger one DB query
- `POST /api/v1/analytics/vitals` accepts beacon data and returns 202
- Migration 0024 adds 3 new indexes
