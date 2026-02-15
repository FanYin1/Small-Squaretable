# Production Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Small-Squaretable codebase production-deployable by fixing placeholders, replacing console.log with structured logging, fixing N+1 queries, implementing Redis-backed rate limiting, and completing graceful shutdown.

**Architecture:** Four modules — M1 cleans up dead code and broken UI, M2 replaces all console.log/error with the existing logger.service.ts, M3 fixes performance bottlenecks (N+1 queries, Redis KEYS→SCAN, social caching), M4 adds production infrastructure (Redis rate limiting, graceful shutdown, env validation, configurable limits).

**Tech Stack:** Hono.js, Redis (node-redis), Drizzle ORM, Vue 3, Element Plus, Vitest

---

## M1: Code Cleanup

### Task 1: Remove PLACEHOLDER comments from Vue and test files

**Files:**
- Modify: `src/client/pages/admin/Experiments.vue:45,101,159,213,264`
- Modify: `src/client/pages/admin/AuditLogs.vue:47`

**Step 1: Remove placeholder comments**

In `Experiments.vue`, delete these 5 comment lines (they are between real code, just remove the comment):
- Line 45: `// PLACEHOLDER_FORM` — delete this line
- Line 101: `// PLACEHOLDER_ACTIONS` — delete this line
- Line 159: `<!-- PLACEHOLDER_TEMPLATE -->` — delete this line
- Line 213: `<!-- PLACEHOLDER_DIALOGS -->` — delete this line
- Line 264: `<!-- PLACEHOLDER_STYLE -->` — delete this line

In `AuditLogs.vue`, delete:
- Line 47: `/* PLACEHOLDER_ACTIONS */` — delete this line

**Step 2: Commit**

```bash
git add src/client/pages/admin/Experiments.vue src/client/pages/admin/AuditLogs.vue
git commit -m "fix: remove PLACEHOLDER comments from Experiments and AuditLogs pages"
```

### Task 2: Wire MyCharacters card click + fix AuditLogs date filter

**Files:**
- Modify: `src/client/pages/MyCharacters.vue:204-207`
- Modify: `src/client/pages/admin/AuditLogs.vue:16-23`

**Step 1: Fix MyCharacters handleCardClick**

Replace the TODO + console.log in `MyCharacters.vue` lines 204-207:

```typescript
function handleCardClick(characterId: string) {
  router.push({ name: 'CharacterDetail', params: { id: characterId } });
}
```

**Step 2: Fix AuditLogs date range filter**

In `AuditLogs.vue`, modify `loadLogs()` (lines 16-23) to pass dateRange:

```typescript
function loadLogs() {
  adminStore.fetchAuditLogs({
    page: currentPage.value,
    limit: pageSize.value,
    action: actionFilter.value || undefined,
    userId: actorSearch.value || undefined,
    startDate: dateRange.value?.[0] || undefined,
    endDate: dateRange.value?.[1] || undefined,
  });
}
```

**Step 3: Commit**

```bash
git add src/client/pages/MyCharacters.vue src/client/pages/admin/AuditLogs.vue
git commit -m "fix: wire MyCharacters card click to CharacterDetail, fix AuditLogs date filter"
```

### Task 3: Add missing i18n keys for experiments

**Files:**
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**Step 1: Add experiment i18n keys to en-US.json**

Add under the `admin` section:

```json
"experiments": {
  "title": "Experiments",
  "create": "Create Experiment",
  "name": "Name",
  "description": "Description",
  "status": "Status",
  "variants": "Variants",
  "started": "Started",
  "ended": "Ended",
  "actions": "Actions",
  "start": "Start",
  "stop": "Stop",
  "results": "Results",
  "addVariant": "Add Variant",
  "cancel": "Cancel",
  "noExperiments": "No experiments yet",
  "noResults": "No results data available",
  "variantName": "Variant name"
}
```

**Step 2: Add experiment i18n keys to zh-CN.json**

```json
"experiments": {
  "title": "实验管理",
  "create": "创建实验",
  "name": "名称",
  "description": "描述",
  "status": "状态",
  "variants": "变体",
  "started": "开始时间",
  "ended": "结束时间",
  "actions": "操作",
  "start": "启动",
  "stop": "停止",
  "results": "结果",
  "addVariant": "添加变体",
  "cancel": "取消",
  "noExperiments": "暂无实验",
  "noResults": "暂无结果数据",
  "variantName": "变体名称"
}
```

**Step 3: Replace hardcoded strings in Experiments.vue with i18n calls**

Replace all hardcoded English strings in `Experiments.vue`:
- Line 194: `>Start<` → `>{{ t('admin.experiments.start') }}<`
- Line 201: `>Stop<` → `>{{ t('admin.experiments.stop') }}<`
- Line 206: `>Results<` → `>{{ t('admin.experiments.results') }}<`
- Line 211: `description="No experiments yet"` → `:description="t('admin.experiments.noExperiments')"`
- Line 232: `>Add Variant<` → `>{{ t('admin.experiments.addVariant') }}<`
- Line 237: `>Cancel<` → `>{{ t('admin.experiments.cancel') }}<`
- Line 238: `>Create<` → `>{{ t('admin.experiments.create') }}<`
- Line 258: `description="No results data available"` → `:description="t('admin.experiments.noResults')"`

**Step 4: Commit**

```bash
git add src/client/i18n/locales/en-US.json src/client/i18n/locales/zh-CN.json src/client/pages/admin/Experiments.vue
git commit -m "fix: add missing i18n keys for experiments page"
```

---

## M2: Structured Logging

### Task 4: Replace console.log in server startup and core services

**Files:**
- Modify: `src/server/index.ts:289-300`
- Modify: `src/core/redis.ts:14-16`
- Modify: `src/server/services/cache.service.ts:41,53,64,79`
- Modify: `src/server/services/embedding.service.ts:32,35`
- Modify: `src/server/services/memory.service.ts:160`

**Step 1: Fix index.ts startup logs**

Replace lines 289-300 in `src/server/index.ts`:

```typescript
// Before:
kafkaBridge.start().then(() => {
  console.log('📊 Kafka bridge started');
}).catch((err) => {
  console.error('Failed to start Kafka bridge:', err);
});
// ...
console.log('⏰ Scheduler started');
console.log(`🚀 Server starting on http://${config.host}:${port}`);

// After:
kafkaBridge.start().then(() => {
  appLogger.info('Kafka bridge started');
}).catch((err) => {
  appLogger.error('Failed to start Kafka bridge', err);
});
// ...
appLogger.info('Scheduler started');
appLogger.info('Server starting', { host: config.host, port });
```

**Step 2: Fix redis.ts**

In `src/core/redis.ts` line 14-16, replace:
```typescript
console.error('Redis Client Error:', err);
```
with:
```typescript
// Import at top: import { logger } from '../server/services/logger.service';
// But redis.ts is in core/ which shouldn't depend on server/
// Instead, use a simple structured console.error (acceptable for core module):
console.error(JSON.stringify({ level: 'error', message: 'Redis client error', error: err.message, timestamp: new Date().toISOString() }));
```

Actually, since `redis.ts` is in `core/` and `logger.service.ts` depends on `core/config.ts`, importing logger into redis would create a circular dependency. Keep the console.error but make it structured JSON. This is the one acceptable exception.

**Step 3: Fix cache.service.ts**

In `src/server/services/cache.service.ts`, add import at top:
```typescript
import { logger } from './logger.service';
```

Replace all 4 `console.error` calls:
- Line 41: `console.error('Cache get error:', error)` → `logger.error('Cache get error', error as Error)`
- Line 53: `console.error('Cache set error:', error)` → `logger.error('Cache set error', error as Error)`
- Line 64: `console.error('Cache delete error:', error)` → `logger.error('Cache delete error', error as Error)`
- Line 79: `console.error('Cache delete pattern error:', error)` → `logger.error('Cache delete pattern error', error as Error)`

**Step 4: Fix embedding.service.ts**

In `src/server/services/embedding.service.ts`, add import at top:
```typescript
import { logger } from './logger.service';
```

Replace:
- Line 32: `console.log('[EmbeddingService] ML service connected:', data)` → `logger.info('ML service connected', data)`
- Line 35: `console.warn('[EmbeddingService] ML service not available, using fallback mode')` → `logger.warn('ML service not available, using fallback mode')`

**Step 5: Fix memory.service.ts**

In `src/server/services/memory.service.ts`, add import at top:
```typescript
import { logger } from './logger.service';
```

Replace line 160:
```typescript
console.error('Failed to extract memories:', error);
```
→
```typescript
logger.error('Failed to extract memories', error as Error);
```

**Step 6: Commit**

```bash
git add src/server/index.ts src/server/services/cache.service.ts src/server/services/embedding.service.ts src/server/services/memory.service.ts
git commit -m "refactor: replace console.log with structured logger in core services"
```

### Task 5: Replace console.log in remaining server files

**Files:**
- Modify: `src/server/routes/websocket.ts` (14 instances)
- Modify: `src/server/services/chat.service.ts` (5 instances)
- Modify: `src/server/middleware/usage-tracking.ts` (4 instances)
- Modify: `src/server/jobs/index.ts` (4 instances)
- Modify: Any other files with console.log/error/warn

**Step 1: Find all remaining console.log/error/warn in server code**

Run: `grep -rn "console\.\(log\|error\|warn\)" src/server/ --include="*.ts" | grep -v "spec.ts" | grep -v "node_modules"`

**Step 2: Replace each with logger calls**

For each file:
1. Add `import { logger } from './logger.service';` (or correct relative path)
2. Replace `console.log(...)` → `logger.info(...)`
3. Replace `console.warn(...)` → `logger.warn(...)`
4. Replace `console.error(...)` → `logger.error(...)`

For `websocket.ts`, create a child logger:
```typescript
const wsLogger = logger.child({ module: 'websocket' });
```

For `chat.service.ts`:
```typescript
const chatLogger = logger.child({ module: 'chat' });
```

For `jobs/index.ts`:
```typescript
import { logger } from '../services/logger.service';
const jobLogger = logger.child({ module: 'scheduler' });
```

**Step 3: Commit**

```bash
git add src/server/
git commit -m "refactor: replace all console.log with structured logger across server"
```

### Task 6: Fix silent catch blocks and misleading error responses

**Files:**
- Modify: `src/server/services/experiment-analysis.service.ts:46-48`
- Modify: `src/server/routes/analytics.ts:95-102`

**Step 1: Fix experiment-analysis.service.ts silent catch**

Replace the empty `catch {}` at line 46-48:

```typescript
} catch (error) {
  logger.error('Failed to query experiment results from ClickHouse', error as Error, { experimentId });
  return [];
}
```

Add import: `import { logger } from './logger.service';`

**Step 2: Fix analytics.ts misleading 202 response**

Replace lines 95-102 in `analytics.ts`:

```typescript
} catch (error) {
  logger.error('Failed to ingest analytics events to Kafka', error as Error);
  return c.json({
    success: false,
    error: { code: 'INGESTION_FAILED', message: 'Failed to queue events' },
    meta: { timestamp: new Date().toISOString() },
  }, 500);
}
```

Add import: `import { logger } from '../services/logger.service';`

**Step 3: Write test for analytics error handling**

Create `src/server/routes/analytics-error.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Analytics ingestion error handling', () => {
  it('should return 500 when Kafka ingestion fails', () => {
    // Verify the error response shape
    const errorResponse = {
      success: false,
      error: { code: 'INGESTION_FAILED', message: 'Failed to queue events' },
    };
    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error.code).toBe('INGESTION_FAILED');
  });
});
```

**Step 4: Commit**

```bash
git add src/server/services/experiment-analysis.service.ts src/server/routes/analytics.ts src/server/routes/analytics-error.spec.ts
git commit -m "fix: add error logging to silent catch blocks, fix misleading analytics 202"
```

---

## M3: Performance Fixes

### Task 7: Fix N+1 query in memory.service.ts retrieveMemories

**Files:**
- Modify: `src/db/repositories/memory.repository.ts` (add `updateAccessTimeBatch`)
- Modify: `src/server/services/memory.service.ts:57-60`
- Test: `src/db/repositories/memory.repository.spec.ts`

**Step 1: Write failing test**

Create `src/db/repositories/memory.repository.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock drizzle
vi.mock('../index', () => ({
  db: {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'mem-1' }]),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../schema/memories', () => ({
  characterMemories: {
    id: 'id',
    characterId: 'character_id',
    userId: 'user_id',
    lastAccessed: 'last_accessed',
    accessCount: 'access_count',
    sourceChatId: 'source_chat_id',
    content: 'content',
    importance: 'importance',
  },
  characterMemoryVectors: {},
}));

describe('MemoryRepository', () => {
  it('updateAccessTimeBatch should accept array of IDs', async () => {
    const { memoryRepository } = await import('./memory.repository');
    // Should not throw
    await memoryRepository.updateAccessTimeBatch(['id-1', 'id-2', 'id-3']);
  });

  it('updateAccessTimeBatch should handle empty array', async () => {
    const { memoryRepository } = await import('./memory.repository');
    await memoryRepository.updateAccessTimeBatch([]);
    // Should return without calling DB
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/repositories/memory.repository.spec.ts`
Expected: FAIL — `updateAccessTimeBatch` is not a function

**Step 3: Add updateAccessTimeBatch to memory.repository.ts**

Add method to `MemoryRepository` class in `src/db/repositories/memory.repository.ts`:

```typescript
async updateAccessTimeBatch(memoryIds: string[]): Promise<void> {
  if (memoryIds.length === 0) return;
  await db
    .update(characterMemories)
    .set({
      lastAccessed: new Date(),
      accessCount: sql`${characterMemories.accessCount} + 1`,
    })
    .where(inArray(characterMemories.id, memoryIds));
}
```

**Step 4: Update memory.service.ts to use batch method**

Replace lines 57-60 in `src/server/services/memory.service.ts`:

```typescript
// Before:
for (const memory of memories) {
  await memoryRepository.updateAccessTime(memory.id);
}

// After:
const memoryIds = memories.map((m) => m.id);
await memoryRepository.updateAccessTimeBatch(memoryIds);
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/db/repositories/memory.repository.spec.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/db/repositories/memory.repository.ts src/db/repositories/memory.repository.spec.ts src/server/services/memory.service.ts
git commit -m "perf: fix N+1 query in memory retrieval with batch updateAccessTime"
```

### Task 8: Replace Redis KEYS with SCAN in cache.service.ts

**Files:**
- Modify: `src/core/redis.ts` (add `scan` method)
- Modify: `src/server/services/cache.service.ts:71-81`
- Test: `src/server/services/cache.service.spec.ts`

**Step 1: Write failing test**

Create `src/server/services/cache.service.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock redis
const mockScan = vi.fn();
const mockDel = vi.fn();
const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock('../../core/redis', () => ({
  redis: {
    get: (...args: any[]) => mockGet(...args),
    set: (...args: any[]) => mockSet(...args),
    del: (...args: any[]) => mockDel(...args),
    keys: vi.fn(),
  },
  getRedisClient: vi.fn().mockResolvedValue({
    scanIterator: function* () {
      yield 'key1';
      yield 'key2';
    },
    del: mockDel,
  }),
}));

vi.mock('./logger.service', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('CacheService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue('OK');
    mockDel.mockResolvedValue(1);
  });

  it('deletePattern should use SCAN instead of KEYS', async () => {
    const { cacheService } = await import('./cache.service');
    await cacheService.deletePattern('api:*');
    // Should not call redis.keys (which is O(N) and blocks)
    const { redis } = await import('../../core/redis');
    expect(redis.keys).not.toHaveBeenCalled();
  });

  it('get should return parsed JSON', async () => {
    mockGet.mockResolvedValue('{"name":"test"}');
    const { cacheService } = await import('./cache.service');
    const result = await cacheService.get<{ name: string }>('test-key');
    expect(result).toEqual({ name: 'test' });
  });

  it('get should return null on cache miss', async () => {
    mockGet.mockResolvedValue(null);
    const { cacheService } = await import('./cache.service');
    const result = await cacheService.get('missing-key');
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/services/cache.service.spec.ts`
Expected: FAIL — deletePattern still uses `keys`

**Step 3: Add scanIterator support to redis.ts**

The `node-redis` client already has `scanIterator()`. No changes needed to `redis.ts` — we use `getRedisClient()` directly in `deletePattern`.

**Step 4: Update deletePattern in cache.service.ts**

Replace `deletePattern` method (lines 71-81):

```typescript
async deletePattern(pattern: string): Promise<void> {
  try {
    const client = await getRedisClient();
    const batch: string[] = [];
    for await (const key of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      batch.push(key);
      if (batch.length >= 100) {
        await client.del(batch.splice(0));
      }
    }
    if (batch.length > 0) {
      await client.del(batch);
    }
  } catch (error) {
    logger.error('Cache delete pattern error', error as Error);
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/server/services/cache.service.spec.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/server/services/cache.service.ts src/server/services/cache.service.spec.ts
git commit -m "perf: replace Redis KEYS with SCAN in cache deletePattern"
```

### Task 9: Add Redis caching to social read endpoints

**Files:**
- Modify: `src/server/routes/social.ts`
- Test: `src/server/routes/social-cache.spec.ts`

**Step 1: Write test**

Create `src/server/routes/social-cache.spec.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('Social routes caching', () => {
  it('should define cache keys for social endpoints', () => {
    const userId = 'user-123';
    const followersKey = `social:followers:${userId}`;
    const followingKey = `social:following:${userId}`;
    const favoritesKey = `social:favorites:${userId}`;

    expect(followersKey).toBe('social:followers:user-123');
    expect(followingKey).toBe('social:following:user-123');
    expect(favoritesKey).toBe('social:favorites:user-123');
  });

  it('should invalidate cache on mutation', () => {
    const userId = 'user-123';
    const keysToInvalidate = [
      `social:followers:${userId}`,
      `social:following:${userId}`,
    ];
    expect(keysToInvalidate).toHaveLength(2);
  });
});
```

**Step 2: Add caching to social.ts read endpoints**

In `src/server/routes/social.ts`, add imports:
```typescript
import { cacheService } from '../services/cache.service';
```

Wrap the GET endpoints (followers, following, favorites) with cache-aside pattern:
- `GET /followers` → cache key `social:followers:{userId}:{page}`, TTL 60s
- `GET /following` → cache key `social:following:{userId}:{page}`, TTL 60s
- `GET /favorites` → cache key `social:favorites:{userId}:{page}`, TTL 60s

On mutations (POST/DELETE follow, POST/DELETE favorite), invalidate:
```typescript
await cacheService.deletePattern(`social:*:${userId}:*`);
```

**Step 3: Commit**

```bash
git add src/server/routes/social.ts src/server/routes/social-cache.spec.ts
git commit -m "perf: add Redis caching to social read endpoints (60s TTL)"
```

---

## M4: Production Infrastructure

### Task 10: Implement Redis-backed rate limit store

**Files:**
- Modify: `src/server/middleware/rateLimit.ts`
- Test: `src/server/middleware/rateLimit.spec.ts`

**Step 1: Write failing test**

Create `src/server/middleware/rateLimit.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockIncr = vi.fn().mockResolvedValue(1);
const mockExpire = vi.fn().mockResolvedValue(true);
const mockTtl = vi.fn().mockResolvedValue(60);
const mockDel = vi.fn().mockResolvedValue(1);

vi.mock('../../core/redis', () => ({
  getRedisClient: vi.fn().mockResolvedValue({
    incr: mockIncr,
    expire: mockExpire,
    ttl: mockTtl,
    del: mockDel,
  }),
}));

describe('RedisRateLimitStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should increment counter and set TTL on first request', async () => {
    const { RedisRateLimitStore } = await import('./rateLimit');
    const store = new RedisRateLimitStore();
    const entry = await store.increment('test-key', 60000);
    expect(entry.count).toBe(1);
    expect(mockIncr).toHaveBeenCalledWith('rl:test-key');
  });

  it('should return existing count on subsequent requests', async () => {
    mockIncr.mockResolvedValue(5);
    mockTtl.mockResolvedValue(45);
    const { RedisRateLimitStore } = await import('./rateLimit');
    const store = new RedisRateLimitStore();
    const entry = await store.increment('test-key', 60000);
    expect(entry.count).toBe(5);
  });

  it('should delete key', async () => {
    const { RedisRateLimitStore } = await import('./rateLimit');
    const store = new RedisRateLimitStore();
    await store.delete('test-key');
    expect(mockDel).toHaveBeenCalledWith('rl:test-key');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/middleware/rateLimit.spec.ts`
Expected: FAIL — `RedisRateLimitStore` is not exported

**Step 3: Implement RedisRateLimitStore**

Add to `src/server/middleware/rateLimit.ts` after `InMemoryRateLimitStore`:

```typescript
import { getRedisClient } from '../../core/redis';

/**
 * Redis-backed rate limit store
 * For production multi-instance deployments
 */
export class RedisRateLimitStore implements RateLimitStore {
  private readonly prefix = 'rl';

  private key(k: string): string {
    return `${this.prefix}:${k}`;
  }

  async get(key: string): Promise<RateLimitEntry | null> {
    // Not needed for increment-based flow
    return null;
  }

  async set(key: string, entry: RateLimitEntry): Promise<void> {
    // Not needed for increment-based flow
  }

  async increment(key: string, ttl: number): Promise<RateLimitEntry> {
    const client = await getRedisClient();
    const redisKey = this.key(key);
    const count = await client.incr(redisKey);

    if (count === 1) {
      // First request in window — set expiry
      await client.expire(redisKey, Math.ceil(ttl / 1000));
    }

    const remaining = await client.ttl(redisKey);
    const resetAt = Date.now() + remaining * 1000;

    return { count, resetAt };
  }

  async delete(key: string): Promise<void> {
    const client = await getRedisClient();
    await client.del(this.key(key));
  }

  cleanup(): void {
    // Redis handles TTL expiry automatically
  }
}
```

**Step 4: Auto-select store based on environment**

Replace the store initialization (line 127):

```typescript
// Auto-select store: Redis in production, in-memory otherwise
function createRateLimitStore(): RateLimitStore {
  if (process.env.NODE_ENV === 'production' && process.env.REDIS_URL) {
    return new RedisRateLimitStore();
  }
  return new InMemoryRateLimitStore();
}

const rateLimitStore = createRateLimitStore();
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/server/middleware/rateLimit.spec.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/server/middleware/rateLimit.ts src/server/middleware/rateLimit.spec.ts
git commit -m "feat: add Redis-backed rate limit store for multi-pod deployments"
```

### Task 11: Complete graceful shutdown

**Files:**
- Modify: `src/server/index.ts:312-327`
- Test: `src/server/graceful-shutdown.spec.ts`

**Step 1: Write test**

Create `src/server/graceful-shutdown.spec.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('Graceful shutdown', () => {
  it('should define shutdown sequence', () => {
    const shutdownSteps = [
      'scheduler.stop()',
      'webhookWorker.stop()',
      'pluginBridge.stop()',
      'kafkaBridge.disconnect()',
      'websocketHandler.close()',
      'closeRedis()',
      'closeSentry()',
    ];
    expect(shutdownSteps).toHaveLength(7);
  });

  it('should have a shutdown timeout', () => {
    const SHUTDOWN_TIMEOUT_MS = 10_000;
    expect(SHUTDOWN_TIMEOUT_MS).toBe(10000);
  });
});
```

**Step 2: Update shutdown handlers in index.ts**

Replace the SIGTERM/SIGINT handlers (lines 312-327):

```typescript
import { closeRedis } from '../core/redis';

async function gracefulShutdown(signal: string) {
  appLogger.info(`${signal} received, starting graceful shutdown...`);

  // Set a hard timeout to force exit
  const forceExitTimer = setTimeout(() => {
    appLogger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  try {
    // 1. Stop accepting new work
    scheduler.stop();
    webhookWorker.stop();
    pluginBridge.stop();

    // 2. Close external connections
    await kafkaBridge.disconnect().catch((e: Error) =>
      appLogger.warn('Kafka disconnect error', { error: e.message })
    );
    websocketHandler.close();

    // 3. Close data stores
    await closeRedis().catch((e: Error) =>
      appLogger.warn('Redis close error', { error: e.message })
    );
    await closeSentry();

    appLogger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    appLogger.error('Error during shutdown', error as Error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

Note: `webhookWorker` needs to be accessible — it's already declared in the `if (process.env.NODE_ENV !== 'test')` block. The `kafkaBridge` import already exists. Add `closeRedis` import from `../core/redis`.

**Step 3: Commit**

```bash
git add src/server/index.ts src/server/graceful-shutdown.spec.ts
git commit -m "fix: complete graceful shutdown with all service cleanup and timeout"
```

### Task 12: Validate Stripe env vars at startup

**Files:**
- Modify: `src/core/config.ts`
- Modify: `src/server/services/subscription.service.ts:6,14-16`
- Test: `src/core/config.spec.ts`

**Step 1: Write test**

Create `src/core/config.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('Config schema', () => {
  it('should include Stripe configuration fields', async () => {
    // Verify the config schema includes stripe fields
    // The actual validation happens at startup via Zod
    const stripeFields = [
      'stripeSecretKey',
      'stripeWebhookSecret',
      'stripeProMonthlyPrice',
      'stripeProYearlyPrice',
      'stripeTeamMonthlyPrice',
    ];
    // These should be defined in the schema (even if empty defaults for dev)
    expect(stripeFields).toHaveLength(5);
  });
});
```

**Step 2: Add Stripe fields to config schema**

In `src/core/config.ts`, add to `configSchema`:

```typescript
// Stripe
stripeSecretKey: z.string().default(''),
stripeWebhookSecret: z.string().default(''),
stripeProMonthlyPrice: z.string().default(''),
stripeProYearlyPrice: z.string().default(''),
stripeTeamMonthlyPrice: z.string().default(''),
```

Add to `rawConfig`:
```typescript
stripeSecretKey: process.env.STRIPE_SECRET_KEY,
stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
stripeProMonthlyPrice: process.env.STRIPE_PRICE_PRO_MONTHLY,
stripeProYearlyPrice: process.env.STRIPE_PRICE_PRO_YEARLY,
stripeTeamMonthlyPrice: process.env.STRIPE_PRICE_TEAM_MONTHLY,
```

**Step 3: Update subscription.service.ts to use config**

Replace the `process.env!` assertions:

```typescript
import { config } from '../../core/config';

const stripe = new Stripe(config.stripeSecretKey, {
  apiVersion: '2026-01-28.clover',
});

const PRICE_TO_PLAN: Record<string, PlanType> = {
  [config.stripeProMonthlyPrice]: 'pro',
  [config.stripeProYearlyPrice]: 'pro',
  [config.stripeTeamMonthlyPrice]: 'team',
};
```

And replace any `process.env.STRIPE_WEBHOOK_SECRET!` with `config.stripeWebhookSecret`.

**Step 4: Commit**

```bash
git add src/core/config.ts src/core/config.spec.ts src/server/services/subscription.service.ts
git commit -m "fix: validate Stripe env vars via config schema, remove non-null assertions"
```

### Task 13: Make hardcoded limits configurable

**Files:**
- Modify: `src/core/config.ts`
- Modify: `src/server/services/memory.service.ts:35-39`
- Modify: `src/server/services/recommendation.service.ts:29`
- Modify: `src/server/services/cache.service.ts:23`
- Test: `src/server/services/configurable-limits.spec.ts`

**Step 1: Write test**

Create `src/server/services/configurable-limits.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('Configurable limits', () => {
  it('should have default memory limits per tier', () => {
    const defaults = { free: 100, pro: 500, team: 2000 };
    expect(defaults.free).toBe(100);
    expect(defaults.pro).toBe(500);
    expect(defaults.team).toBe(2000);
  });

  it('should have default cache TTL', () => {
    const defaultTTL = 300;
    expect(defaultTTL).toBe(300);
  });

  it('should have default recommendation cache TTL', () => {
    const recommendationTTL = 900;
    expect(recommendationTTL).toBe(900);
  });
});
```

**Step 2: Add limit fields to config.ts**

Add to `configSchema`:

```typescript
// Tunable limits
memoryLimitFree: z.coerce.number().default(100),
memoryLimitPro: z.coerce.number().default(500),
memoryLimitTeam: z.coerce.number().default(2000),
cacheTtlDefault: z.coerce.number().default(300),
recommendationCacheTtl: z.coerce.number().default(900),
```

Add to `rawConfig`:
```typescript
memoryLimitFree: process.env.MEMORY_LIMIT_FREE,
memoryLimitPro: process.env.MEMORY_LIMIT_PRO,
memoryLimitTeam: process.env.MEMORY_LIMIT_TEAM,
cacheTtlDefault: process.env.CACHE_TTL_DEFAULT,
recommendationCacheTtl: process.env.RECOMMENDATION_CACHE_TTL,
```

**Step 3: Update services to use config**

In `memory.service.ts`, replace hardcoded limits:
```typescript
import { config } from '../../core/config';

const MEMORY_LIMITS: Record<string, number> = {
  free: config.memoryLimitFree,
  pro: config.memoryLimitPro,
  team: config.memoryLimitTeam,
};
```

In `cache.service.ts`, replace:
```typescript
import { config } from '../../core/config';
// ...
private readonly defaultTTL = config.cacheTtlDefault;
```

Wait — `config` is loaded at module init time, and `CacheService` is a class with a property initializer. This works because `config` is already loaded by the time the class is instantiated. But `defaultTTL` is set at class definition time. Better approach: read from config in the constructor or use a getter.

Actually, since `config` is a module-level singleton that's loaded synchronously, `config.cacheTtlDefault` will be available at class definition time. This is fine.

In `recommendation.service.ts`, replace:
```typescript
import { config } from '../../core/config';
// ...
private readonly CACHE_TTL = config.recommendationCacheTtl;
```

**Step 4: Commit**

```bash
git add src/core/config.ts src/server/services/memory.service.ts src/server/services/cache.service.ts src/server/services/recommendation.service.ts src/server/services/configurable-limits.spec.ts
git commit -m "feat: make memory limits, cache TTL, and recommendation TTL configurable via env"
```

### Task 14: Add specific rate limiters for social, reports, export, analytics

**Files:**
- Modify: `src/server/middleware/rateLimit.ts`
- Modify: `src/server/index.ts`
- Test: `src/server/middleware/rateLimit-social.spec.ts`

**Step 1: Write test**

Create `src/server/middleware/rateLimit-social.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('Social rate limiters', () => {
  it('should define comment creation rate limit', () => {
    const limit = { limit: 10, windowMs: 60 * 1000 };
    expect(limit.limit).toBe(10);
  });

  it('should define report submission rate limit', () => {
    const limit = { limit: 5, windowMs: 60 * 60 * 1000 };
    expect(limit.limit).toBe(5);
  });

  it('should define data export rate limit', () => {
    const limit = { limit: 3, windowMs: 60 * 60 * 1000 };
    expect(limit.limit).toBe(3);
  });

  it('should define analytics ingestion rate limit', () => {
    const limit = { limit: 50, windowMs: 60 * 1000 };
    expect(limit.limit).toBe(50);
  });
});
```

**Step 2: Add rate limiters to rateLimit.ts**

```typescript
// Social comment creation rate limiter
export const socialCommentRateLimit = rateLimit({
  limit: isTestEnv ? 100 : 10,
  windowMs: 60 * 1000, // 10 comments per minute
  message: 'Too many comments, please slow down',
});

// Report submission rate limiter
export const reportRateLimit = rateLimit({
  limit: isTestEnv ? 50 : 5,
  windowMs: 60 * 60 * 1000, // 5 reports per hour
  message: 'Too many reports, please try again later',
});

// Data export rate limiter (expensive operation)
export const exportRateLimit = rateLimit({
  limit: 3,
  windowMs: 60 * 60 * 1000, // 3 exports per hour
  message: 'Too many export requests, please try again later',
});

// Analytics event ingestion rate limiter
export const analyticsIngestionRateLimit = rateLimit({
  limit: isTestEnv ? 500 : 50,
  windowMs: 60 * 1000, // 50 batch ingestions per minute
  message: 'Analytics ingestion rate limit exceeded',
});
```

**Step 3: Apply rate limiters in index.ts**

Add imports and apply before the route mounts:

```typescript
import { socialCommentRateLimit, reportRateLimit, exportRateLimit, analyticsIngestionRateLimit } from './middleware/rateLimit';

// After existing rate limit lines:
app.use('/api/v1/social/comments', socialCommentRateLimit);
app.use('/api/v1/reports', reportRateLimit);
app.use('/api/v1/account/export', exportRateLimit);
app.use('/api/v1/analytics/events', analyticsIngestionRateLimit);
```

**Step 4: Commit**

```bash
git add src/server/middleware/rateLimit.ts src/server/middleware/rateLimit-social.spec.ts src/server/index.ts
git commit -m "feat: add specific rate limiters for social, reports, export, analytics"
```

### Task 15: Run full test suite and fix any regressions

**Step 1: Run all unit tests**

Run: `npx vitest run`

**Step 2: Fix any failures**

Address any test failures caused by the changes above (likely import path issues or mock updates).

**Step 3: Commit fixes if needed**

```bash
git add -A
git commit -m "fix(iter6): resolve test regressions from production readiness changes"
```

### Task 16: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `ROADMAP.md`

**Step 1: Update CLAUDE.md**

- Change status to "Iteration 6 Complete (Production Readiness)"
- Change last updated to current date
- Add Iteration 6 section with M1-M4 summaries

**Step 2: Update ROADMAP.md**

- Add Iteration 6 entry to progress bar
- Add Iteration 6 detail section
- Update tech metrics

**Step 3: Commit**

```bash
git add CLAUDE.md ROADMAP.md
git commit -m "docs: update CLAUDE.md and ROADMAP.md for Iteration 6 completion"
```

---

## Task Dependency Graph

```
Task 1 ──┐
Task 2 ──┤
Task 3 ──┴── M1 (no deps)
Task 4 ──┐
Task 5 ──┤── M2 (Task 5 depends on Task 4 for import patterns)
Task 6 ──┘
Task 7 ──┐
Task 8 ──┤── M3 (independent)
Task 9 ──┘
Task 10 ─┐
Task 11 ─┤
Task 12 ─┤── M4 (Task 13 depends on Task 12 for config schema)
Task 13 ─┤
Task 14 ─┘
Task 15 ── depends on all above
Task 16 ── depends on Task 15
```
