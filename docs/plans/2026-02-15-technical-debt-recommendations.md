# Technical Debt + Recommendations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close all known placeholder/stub code, build the recommendation engine and A/B testing framework that were skipped in Iteration 3, and add a scheduled job runner for operational tasks.

**Architecture:** Four modules — M1 fixes broken code and creates missing pages, M2 builds a recommendation service on top of the existing Redis feature store, M3 adds a lightweight A/B testing framework with ClickHouse analytics, M4 adds a setInterval-based scheduler for GDPR deletion, audit retention, and token cleanup.

**Tech Stack:** Hono.js, Drizzle ORM, Redis (feature store reads), ClickHouse (experiment analytics), Vue 3 + Element Plus, Vitest

---

## Dependency Graph

```
Task 1 (LRU Eviction) ─────────────────────────────────────────┐
Task 2 (Favorites Count) ──────────────────────────────────────┤
Task 3 (Extract Memories Endpoint) ────────────────────────────┤
Task 4 (Missing Pages: WorldBooks, Legal, CharacterDetail) ────┤
Task 5 (Admin Audit Logs Page) ────────────────────────────────┤
Task 6 (Theme Toggle + Language Switcher) ─────────────────────┤── All independent
Task 7 (Recommendation Service) ───────────────────────────────┤
Task 8 (Recommendation API Routes) ── depends on Task 7 ──────┤
Task 9 (Recommendation Frontend) ── depends on Task 8 ────────┤
Task 10 (Experiments Schema + Repository) ─────────────────────┤
Task 11 (Experiment Service) ── depends on Task 10 ───────────┤
Task 12 (Experiment API + Admin Page) ── depends on Task 11 ──┤
Task 13 (Experiment ↔ Recommendation Integration) ── depends on Task 7, 11 ─┤
Task 14 (Scheduler Service) ──────────────────────────────────┤
Task 15 (Scheduled Jobs) ── depends on Task 14 ──────────────┤
Task 16 (Admin Jobs UI + E2E Tests) ── depends on Task 15 ───┘
```

---

## Module 1: Fix Placeholders & Missing Pages

### Task 1: Implement LRU Memory Eviction

**Files:**
- Modify: `src/server/services/memory.service.ts:70-85`
- Modify: `src/db/repositories/memory.repository.ts` (add `deleteOldest`)
- Test: `src/server/services/memory.service.spec.ts`

**Step 1: Add `deleteOldest` to memory repository**

In `src/db/repositories/memory.repository.ts`, add:

```typescript
async deleteOldest(characterId: string, userId: string, count: number): Promise<number> {
  const oldest = await db
    .select({ id: characterMemories.id })
    .from(characterMemories)
    .where(
      and(
        eq(characterMemories.characterId, characterId),
        eq(characterMemories.userId, userId),
      ),
    )
    .orderBy(asc(characterMemories.lastAccessed))
    .limit(count);

  if (oldest.length === 0) return 0;

  const ids = oldest.map((r) => r.id);
  await db.delete(characterMemories).where(inArray(characterMemories.id, ids));
  return ids.length;
}
```

**Step 2: Write the failing test**

Create `src/server/services/memory.service.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../db/repositories/memory.repository', () => ({
  memoryRepository: {
    countByCharacterUser: vi.fn(),
    deleteOldest: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 'mem-1' }),
    createVector: vi.fn(),
  },
}));
vi.mock('../services/embedding.service', () => ({
  embeddingService: { embed: vi.fn().mockResolvedValue(new Array(384).fill(0)) },
}));

import { memoryService } from './memory.service';
import { memoryRepository } from '../../db/repositories/memory.repository';

describe('MemoryService LRU eviction', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should evict oldest memories when limit is reached', async () => {
    vi.mocked(memoryRepository.countByCharacterUser).mockResolvedValue(100);
    vi.mocked(memoryRepository.deleteOldest).mockResolvedValue(1);

    await memoryService.storeMemory('char-1', 'user-1', {
      type: 'fact', content: 'test', importance: 0.5,
    }, undefined, 'free');

    expect(memoryRepository.deleteOldest).toHaveBeenCalledWith('char-1', 'user-1', 1);
    expect(memoryRepository.create).toHaveBeenCalled();
  });

  it('should not evict when under limit', async () => {
    vi.mocked(memoryRepository.countByCharacterUser).mockResolvedValue(50);

    await memoryService.storeMemory('char-1', 'user-1', {
      type: 'fact', content: 'test', importance: 0.5,
    }, undefined, 'free');

    expect(memoryRepository.deleteOldest).not.toHaveBeenCalled();
    expect(memoryRepository.create).toHaveBeenCalled();
  });

  it('should use tier-specific limits', async () => {
    vi.mocked(memoryRepository.countByCharacterUser).mockResolvedValue(200);
    vi.mocked(memoryRepository.deleteOldest).mockResolvedValue(1);

    await memoryService.storeMemory('char-1', 'user-1', {
      type: 'fact', content: 'test', importance: 0.5,
    }, undefined, 'pro');

    // 200 < 500 (pro limit), so no eviction
    expect(memoryRepository.deleteOldest).not.toHaveBeenCalled();
  });
});
```

**Step 3: Implement LRU eviction in memory.service.ts**

Replace lines 81-84 in `storeMemory`:

```typescript
if (currentCount >= limit) {
  // LRU eviction: delete oldest memory to make room
  await memoryRepository.deleteOldest(characterId, userId, 1);
}
```

**Step 4: Run tests**

Run: `npx vitest run src/server/services/memory.service.spec.ts`

**Step 5: Commit**

```bash
git add src/server/services/memory.service.ts src/db/repositories/memory.repository.ts src/server/services/memory.service.spec.ts
git commit -m "fix(memory): implement LRU eviction when memory limit reached"
```

---

### Task 2: Wire Favorites Count in Character Stats

**Files:**
- Modify: `src/server/routes/characters.ts:207-222`
- Test: `src/server/routes/characters-stats.spec.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../index';

vi.mock('../services/character.service', () => ({
  characterService: {
    getByTenantId: vi.fn().mockResolvedValue({ items: [], pagination: { total: 5 } }),
  },
}));
vi.mock('../../db/repositories/favorite.repository', () => ({
  favoriteRepository: {
    getFavoritesByUser: vi.fn().mockResolvedValue([1, 2, 3]),
  },
}));
// ... standard auth/csrf/rateLimit mocks

describe('GET /characters/stats', () => {
  it('should return real favorites count', async () => {
    const res = await app.request('/api/v1/characters/stats', {
      headers: { Authorization: 'Bearer test-token' },
    });
    const body = await res.json();
    expect(body.data.favorites).toBe(3);
  });
});
```

**Step 2: Fix the stats endpoint**

In `src/server/routes/characters.ts`, replace the stats handler:

```typescript
import { favoriteRepository } from '../../db/repositories/favorite.repository';

// In the /stats handler, replace `favorites: 0, // TODO: implement favorites` with:
characterRoutes.get('/stats', authMiddleware(), async (c) => {
  const user = c.get('user');
  const result = await characterService.getByTenantId(user.tenantId, { page: 1, limit: 1000 });
  const userFavorites = await favoriteRepository.getFavoritesByUser(user.id, 10000, 0);

  return c.json<ApiResponse>(
    {
      success: true,
      data: {
        total: result.pagination.total,
        favorites: userFavorites.length,
      },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});
```

**Step 3: Run tests and commit**

```bash
git add src/server/routes/characters.ts src/server/routes/characters-stats.spec.ts
git commit -m "fix(characters): wire favorites count to actual favorites table"
```

---

### Task 3: Implement Extract-Memories Endpoint

**Files:**
- Modify: `src/server/routes/intelligence.ts:95-111`
- Test: `src/server/routes/intelligence-extract.spec.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/memory.service', () => ({
  memoryService: {
    extractMemories: vi.fn().mockResolvedValue([
      { type: 'fact', content: 'User likes cats', importance: 0.7 },
    ]),
    storeMemory: vi.fn(),
  },
}));
vi.mock('../../db/repositories/message.repository', () => ({
  messageRepository: {
    findByChatId: vi.fn().mockResolvedValue([
      { role: 'user', content: 'I love cats' },
      { role: 'assistant', content: 'Cats are great!' },
    ]),
  },
}));
// ... standard mocks

describe('POST /characters/:id/intelligence/extract-memories', () => {
  it('should extract and store memories from chat', async () => {
    // ... test that endpoint calls extractMemories + storeMemory
  });
});
```

**Step 2: Implement the endpoint**

Replace the placeholder in `intelligence.ts`:

```typescript
import { messageRepository } from '../../db/repositories/message.repository';

// In the extract-memories handler:
intelligenceRoutes.post(
  '/characters/:characterId/intelligence/extract-memories',
  authMiddleware(),
  zValidator('json', extractMemoriesSchema),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('characterId');
    const { chatId } = c.req.valid('json');

    // Fetch recent messages from the chat
    const chatMessages = await messageRepository.findByChatId(chatId, { limit: 50 });
    if (chatMessages.length === 0) {
      return c.json<ApiResponse>({
        success: true,
        data: { extracted: 0, memories: [] },
        meta: { timestamp: new Date().toISOString() },
      });
    }

    // Extract memories via LLM
    const facts = await memoryService.extractMemories(characterId, user.id, chatMessages);

    // Store each extracted memory
    for (const fact of facts) {
      await memoryService.storeMemory(characterId, user.id, fact, chatId);
    }

    return c.json<ApiResponse>({
      success: true,
      data: { extracted: facts.length, memories: facts },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);
```

**Step 3: Run tests and commit**

```bash
git add src/server/routes/intelligence.ts src/server/routes/intelligence-extract.spec.ts
git commit -m "fix(intelligence): implement extract-memories endpoint with LLM extraction"
```

---

### Task 4: Create Missing Pages (WorldBooks, Legal, CharacterDetail Route)

**Files:**
- Create: `src/client/pages/WorldBooks.vue`
- Create: `src/client/pages/legal/Terms.vue`
- Create: `src/client/pages/legal/Privacy.vue`
- Create: `src/client/pages/legal/About.vue`
- Modify: `src/client/router/routes.ts` (add CharacterDetail route)
- Modify: `src/client/pages/Market.vue:71` (wire card click to route)
- Modify: `src/client/i18n/locales/en-US.json` (add i18n keys)
- Modify: `src/client/i18n/locales/zh-CN.json` (add i18n keys)

**Step 1: Create WorldBooks.vue**

A page that lists the user's world books with CRUD. The backend API already exists at `/api/v1/worldbooks`. Use DashboardLayout, el-table for the list, el-dialog for create/edit.

**Step 2: Create legal pages**

Simple static pages with DashboardLayout wrapper. Terms.vue, Privacy.vue, About.vue — placeholder legal content.

**Step 3: Add CharacterDetail route**

In `routes.ts`, add a new route:

```typescript
const loadCharacterDetail = () => import(/* webpackChunkName: "characters" */ '../pages/CharacterDetail.vue');

// Add after the /market route:
{
  path: '/characters/:id',
  name: 'CharacterDetail',
  component: loadCharacterDetail,
  meta: { requiresAuth: false, guestOnly: false },
},
```

Note: `CharacterDetail.vue` already exists as a component — check if it's a page or component. If it's a component, create a page wrapper that uses it.

**Step 4: Wire Market.vue card click**

Replace the TODO in `Market.vue:71`:

```typescript
function handleCardClick(characterId: string) {
  router.push({ name: 'CharacterDetail', params: { id: characterId } });
}
```

Add `import { useRouter } from 'vue-router'` and `const router = useRouter()`.

**Step 5: Add i18n keys and commit**

```bash
git add src/client/pages/WorldBooks.vue src/client/pages/legal/ src/client/router/routes.ts src/client/pages/Market.vue src/client/i18n/
git commit -m "feat(frontend): add WorldBooks, legal pages, and CharacterDetail route"
```

---

### Task 5: Create Dedicated Admin Audit Logs Page

**Files:**
- Create: `src/client/pages/admin/AuditLogs.vue`
- Modify: `src/client/router/routes.ts:309-316` (point to new component)
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**Step 1: Create AuditLogs.vue**

A dedicated page with:
- el-table showing audit log entries (timestamp, actor, action, target, IP hash)
- Filters: action type dropdown, date range picker, actor search
- Pagination via el-pagination
- Fetches from `GET /api/v1/admin/audit-logs`

**Step 2: Update route to use new component**

In `routes.ts`, replace the audit-logs route:

```typescript
const loadAdminAuditLogs = () => import(/* webpackChunkName: "admin" */ '../pages/admin/AuditLogs.vue');

// Replace the audit-logs child route:
{
  path: 'audit-logs',
  name: 'AdminAuditLogs',
  component: loadAdminAuditLogs,
  meta: { requiresAuth: true, requiresRole: 'admin' },
},
```

**Step 3: Commit**

```bash
git add src/client/pages/admin/AuditLogs.vue src/client/router/routes.ts src/client/i18n/
git commit -m "feat(admin): add dedicated audit logs viewer page"
```

---

### Task 6: Theme Toggle + Language Switcher

**Files:**
- Create: `src/client/composables/useTheme.ts`
- Modify: `src/client/components/layout/DashboardLayout.vue` (add toggle + switcher to header)
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`
- Test: `src/client/composables/useTheme.spec.ts`

**Step 1: Create useTheme composable**

```typescript
import { ref, watchEffect } from 'vue';

const STORAGE_KEY = 'theme-preference';
type Theme = 'light' | 'dark';

const theme = ref<Theme>((localStorage.getItem(STORAGE_KEY) as Theme) || 'light');

export function useTheme() {
  watchEffect(() => {
    document.documentElement.setAttribute('data-theme', theme.value);
    localStorage.setItem(STORAGE_KEY, theme.value);
  });

  function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light';
  }

  return { theme, toggleTheme };
}
```

**Step 2: Add theme toggle and language switcher to DashboardLayout header**

- Theme: el-switch or icon button that calls `toggleTheme()`
- Language: el-dropdown with en-US / zh-CN options, calls `i18n.global.locale.value = locale`

**Step 3: Write test for useTheme**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTheme } from './useTheme';

describe('useTheme', () => {
  beforeEach(() => { localStorage.clear(); });

  it('should default to light theme', () => {
    const { theme } = useTheme();
    expect(theme.value).toBe('light');
  });

  it('should toggle between light and dark', () => {
    const { theme, toggleTheme } = useTheme();
    toggleTheme();
    expect(theme.value).toBe('dark');
    toggleTheme();
    expect(theme.value).toBe('light');
  });
});
```

**Step 4: Commit**

```bash
git add src/client/composables/useTheme.ts src/client/composables/useTheme.spec.ts src/client/components/layout/DashboardLayout.vue src/client/i18n/
git commit -m "feat(ui): add theme toggle and language switcher"
```

---

## Module 2: Recommendation Engine

### Task 7: Recommendation Service

**Files:**
- Create: `src/server/services/recommendation.service.ts`
- Test: `src/server/services/recommendation.spec.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/feature-store.service', () => ({
  featureStoreService: {
    getTrending: vi.fn().mockResolvedValue([
      { characterId: 'char-1', score: 10 },
      { characterId: 'char-2', score: 8 },
    ]),
    getUserInterests: vi.fn().mockResolvedValue([
      { tag: 'fantasy', score: 5 },
      { tag: 'sci-fi', score: 3 },
    ]),
    getUserRecent: vi.fn().mockResolvedValue(['char-3']),
    getCharacterStats: vi.fn().mockResolvedValue({ chat_count: '50', trending_score: '8.5' }),
  },
}));
vi.mock('../../db/repositories/character.repository', () => ({
  characterRepository: {
    findById: vi.fn().mockImplementation((id) => ({
      id, name: `Char ${id}`, tags: ['fantasy'], isPublic: true,
    })),
    findPublicByTags: vi.fn().mockResolvedValue([
      { id: 'char-4', name: 'Fantasy Hero', tags: ['fantasy'] },
    ]),
  },
}));
vi.mock('../../core/redis', () => ({
  getRedisClient: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    setEx: vi.fn(),
  }),
}));

import { recommendationService } from './recommendation.service';

describe('RecommendationService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should return trending characters', async () => {
    const result = await recommendationService.getTrending(10);
    expect(result).toHaveLength(2);
    expect(result[0].characterId).toBe('char-1');
  });

  it('should return personalized recommendations', async () => {
    const result = await recommendationService.getPersonalized('user-1', 10);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should return similar characters', async () => {
    const result = await recommendationService.getSimilar('char-1', 5);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should cache personalized results', async () => {
    await recommendationService.getPersonalized('user-1', 10);
    // Second call should use cache
    await recommendationService.getPersonalized('user-1', 10);
    // featureStoreService.getUserInterests should only be called once
  });
});
```

**Step 2: Implement recommendation service**

```typescript
// src/server/services/recommendation.service.ts
import { featureStoreService } from './feature-store.service';
import { characterRepository } from '../../db/repositories/character.repository';
import { getRedisClient } from '../../core/redis';

const CACHE_TTL = 900; // 15 minutes

export interface RecommendationItem {
  characterId: string;
  score: number;
  source: 'trending' | 'collaborative' | 'content-based';
}

export const recommendationService = {
  async getTrending(limit: number): Promise<RecommendationItem[]> {
    const trending = await featureStoreService.getTrending(limit);
    return trending.map((t) => ({
      characterId: t.characterId,
      score: t.score,
      source: 'trending' as const,
    }));
  },

  async getPersonalized(userId: string, limit: number, weights?: { trending: number; collaborative: number; contentBased: number }): Promise<RecommendationItem[]> {
    const redis = await getRedisClient();
    const cacheKey = `rec:personal:${userId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const w = weights ?? { trending: 0.3, collaborative: 0.4, contentBased: 0.3 };

    // 1. Trending
    const trending = await this.getTrending(limit);

    // 2. Collaborative: users with similar interests
    const interests = await featureStoreService.getUserInterests(userId, 10);
    const recentIds = await featureStoreService.getUserRecent(userId, 20);
    const tags = interests.map((i) => i.tag);
    const collaborative = tags.length > 0
      ? (await characterRepository.findPublicByTags(tags, limit)).map((c) => ({
          characterId: c.id, score: 1, source: 'collaborative' as const,
        }))
      : [];

    // 3. Blend and deduplicate
    const scoreMap = new Map<string, { score: number; source: RecommendationItem['source'] }>();
    for (const item of trending) {
      scoreMap.set(item.characterId, { score: item.score * w.trending, source: item.source });
    }
    for (const item of collaborative) {
      const existing = scoreMap.get(item.characterId);
      scoreMap.set(item.characterId, {
        score: (existing?.score ?? 0) + item.score * w.collaborative,
        source: existing ? existing.source : item.source,
      });
    }

    // Filter out recently viewed
    const recentSet = new Set(recentIds);
    const results = Array.from(scoreMap.entries())
      .filter(([id]) => !recentSet.has(id))
      .map(([characterId, { score, source }]) => ({ characterId, score, source }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(results));
    return results;
  },

  async getSimilar(characterId: string, limit: number): Promise<RecommendationItem[]> {
    const character = await characterRepository.findById(characterId);
    if (!character || !character.tags?.length) return [];

    const similar = await characterRepository.findPublicByTags(character.tags, limit + 1);
    return similar
      .filter((c) => c.id !== characterId)
      .slice(0, limit)
      .map((c) => ({ characterId: c.id, score: 1, source: 'content-based' as const }));
  },
};
```

Note: `characterRepository.findPublicByTags` may need to be added — a simple query filtering `isPublic = true AND tags && $tags` (array overlap).

**Step 3: Add `findPublicByTags` to character repository if missing**

```typescript
async findPublicByTags(tags: string[], limit: number): Promise<Character[]> {
  return await db
    .select()
    .from(characters)
    .where(
      and(
        eq(characters.isPublic, true),
        sql`${characters.tags} && ${sql.raw(`ARRAY[${tags.map(t => `'${t}'`).join(',')}]::text[]`)}`,
      ),
    )
    .limit(limit);
}
```

**Step 4: Run tests and commit**

```bash
git add src/server/services/recommendation.service.ts src/server/services/recommendation.spec.ts src/db/repositories/character.repository.ts
git commit -m "feat(recommendations): add recommendation service with trending, collaborative, and content-based strategies"
```

---

### Task 8: Recommendation API Routes

**Files:**
- Create: `src/server/routes/recommendations.ts`
- Modify: `src/server/index.ts` (mount routes)
- Test: `src/server/routes/recommendations.spec.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/recommendation.service', () => ({
  recommendationService: {
    getPersonalized: vi.fn().mockResolvedValue([
      { characterId: 'char-1', score: 10, source: 'trending' },
    ]),
    getTrending: vi.fn().mockResolvedValue([
      { characterId: 'char-2', score: 8, source: 'trending' },
    ]),
    getSimilar: vi.fn().mockResolvedValue([
      { characterId: 'char-3', score: 5, source: 'content-based' },
    ]),
  },
}));
// ... standard auth mocks

describe('Recommendation Routes', () => {
  it('GET /recommendations should return personalized results', async () => { /* ... */ });
  it('GET /recommendations/trending should return trending', async () => { /* ... */ });
  it('GET /recommendations/similar/:characterId should return similar', async () => { /* ... */ });
  it('POST /recommendations/feedback should accept feedback event', async () => { /* ... */ });
});
```

**Step 2: Implement routes**

```typescript
// src/server/routes/recommendations.ts
import { Hono } from 'hono';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { recommendationService } from '../services/recommendation.service';
import { eventBus } from '../services/event-bus.service';
import type { ApiResponse } from '../../types/api';

export const recommendationRoutes = new Hono();

// Personalized recommendations (auth required)
recommendationRoutes.get('/', authMiddleware(), async (c) => {
  const user = c.get('user');
  const limit = Number(c.req.query('limit') ?? 20);
  const results = await recommendationService.getPersonalized(user.id, limit);
  return c.json<ApiResponse>({ success: true, data: results, meta: { timestamp: new Date().toISOString() } });
});

// Public trending
recommendationRoutes.get('/trending', optionalAuthMiddleware(), async (c) => {
  const limit = Number(c.req.query('limit') ?? 20);
  const results = await recommendationService.getTrending(limit);
  return c.json<ApiResponse>({ success: true, data: results, meta: { timestamp: new Date().toISOString() } });
});

// Similar characters
recommendationRoutes.get('/similar/:characterId', optionalAuthMiddleware(), async (c) => {
  const characterId = c.req.param('characterId');
  const limit = Number(c.req.query('limit') ?? 10);
  const results = await recommendationService.getSimilar(characterId, limit);
  return c.json<ApiResponse>({ success: true, data: results, meta: { timestamp: new Date().toISOString() } });
});

// Feedback event (click, dismiss, chat-start)
recommendationRoutes.post('/feedback', authMiddleware(), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  eventBus.emit('recommendation.feedback', { userId: user.id, ...body });
  return c.json<ApiResponse>({ success: true, data: { received: true }, meta: { timestamp: new Date().toISOString() } });
});
```

**Step 3: Mount in server/index.ts**

```typescript
import { recommendationRoutes } from './routes/recommendations';
// Add tenant middleware + CSRF + route mounting
app.use('/api/v1/recommendations/*', tenantMiddleware({ publicPaths }));
app.use('/api/v1/recommendations', csrfProtection());
app.route('/api/v1/recommendations', recommendationRoutes);
```

Also add `/api/v1/recommendations/trending` and `/api/v1/recommendations/similar` to `publicPaths`.

**Step 4: Run tests and commit**

```bash
git add src/server/routes/recommendations.ts src/server/routes/recommendations.spec.ts src/server/index.ts
git commit -m "feat(recommendations): add API routes for personalized, trending, and similar"
```

---

### Task 9: Recommendation Frontend

**Files:**
- Create: `src/client/components/recommendation/RecommendationCarousel.vue`
- Create: `src/client/services/recommendation.api.ts`
- Modify: `src/client/pages/Dashboard.vue` (add "For You" section)
- Modify: `src/client/pages/Market.vue` (add trending section)
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**Step 1: Create recommendation API service**

```typescript
// src/client/services/recommendation.api.ts
import { api } from './api';

export const recommendationApi = {
  getPersonalized: (limit = 20) => api.get(`/recommendations?limit=${limit}`),
  getTrending: (limit = 20) => api.get(`/recommendations/trending?limit=${limit}`),
  getSimilar: (characterId: string, limit = 10) => api.get(`/recommendations/similar/${characterId}?limit=${limit}`),
  sendFeedback: (data: { characterId: string; action: string; position?: number }) =>
    api.post('/recommendations/feedback', data),
};
```

**Step 2: Create RecommendationCarousel component**

A horizontal scrollable row of CharacterCard components. Props: `items`, `title`, `loading`. Emits: `click(characterId)`.

**Step 3: Add "For You" section to Dashboard**

After the welcome section, before the dashboard grid:

```vue
<RecommendationCarousel
  v-if="recommendations.length > 0"
  :items="recommendations"
  :title="$t('dashboard.forYou')"
  :loading="recLoading"
  @click="handleRecommendationClick"
/>
```

Fetch recommendations in `onMounted`.

**Step 4: Add trending section to Market page**

Before the filter toolbar, show a trending carousel when no search query is active.

**Step 5: Commit**

```bash
git add src/client/components/recommendation/ src/client/services/recommendation.api.ts src/client/pages/Dashboard.vue src/client/pages/Market.vue src/client/i18n/
git commit -m "feat(frontend): add recommendation carousel to Dashboard and Market"
```

---

## Module 3: A/B Testing Framework

### Task 10: Experiments Schema + Repository

**Files:**
- Create: `src/db/schema/experiments.ts`
- Create: `src/db/repositories/experiment.repository.ts`
- Modify: `src/db/schema/index.ts` (add export)
- Test: `src/db/repositories/experiment.repository.spec.ts`

**Step 1: Create schema**

```typescript
// src/db/schema/experiments.ts
import { pgTable, uuid, varchar, text, jsonb, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const experimentStatusEnum = pgEnum('experiment_status', ['draft', 'running', 'completed']);

export const experiments = pgTable('experiments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: experimentStatusEnum('status').default('draft').notNull(),
  variants: jsonb('variants').notNull().$type<Array<{ name: string; weight: number; config: Record<string, unknown> }>>(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Experiment = typeof experiments.$inferSelect;
export type NewExperiment = typeof experiments.$inferInsert;
```

**Step 2: Create repository**

```typescript
// src/db/repositories/experiment.repository.ts
import { eq, and } from 'drizzle-orm';
import { db } from '../index';
import { experiments, type Experiment, type NewExperiment } from '../schema/experiments';

export class ExperimentRepository {
  async create(data: NewExperiment): Promise<Experiment> {
    const [row] = await db.insert(experiments).values(data).returning();
    return row;
  }

  async findById(id: string): Promise<Experiment | null> {
    const [row] = await db.select().from(experiments).where(eq(experiments.id, id));
    return row ?? null;
  }

  async findByTenant(tenantId: string): Promise<Experiment[]> {
    return db.select().from(experiments).where(eq(experiments.tenantId, tenantId));
  }

  async findActive(): Promise<Experiment[]> {
    return db.select().from(experiments).where(eq(experiments.status, 'running'));
  }

  async findByName(name: string): Promise<Experiment | null> {
    const [row] = await db.select().from(experiments).where(eq(experiments.name, name));
    return row ?? null;
  }

  async update(id: string, data: Partial<NewExperiment>): Promise<Experiment> {
    const [row] = await db.update(experiments).set({ ...data, updatedAt: new Date() }).where(eq(experiments.id, id)).returning();
    return row;
  }
}

export const experimentRepository = new ExperimentRepository();
```

**Step 3: Write tests**

```typescript
// Test CRUD operations with mocked db
describe('ExperimentRepository', () => {
  it('should create an experiment', async () => { /* ... */ });
  it('should find active experiments', async () => { /* ... */ });
  it('should update experiment status', async () => { /* ... */ });
});
```

**Step 4: Export from schema/index.ts and commit**

```bash
git add src/db/schema/experiments.ts src/db/repositories/experiment.repository.ts src/db/schema/index.ts src/db/repositories/experiment.repository.spec.ts
git commit -m "feat(experiments): add experiments schema and repository"
```

---

### Task 11: Experiment Service

**Files:**
- Create: `src/server/services/experiment.service.ts`
- Create: `src/server/services/experiment-analysis.service.ts`
- Test: `src/server/services/experiment.spec.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/repositories/experiment.repository', () => ({
  experimentRepository: {
    findByName: vi.fn(),
    findActive: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('../../core/redis', () => ({
  getRedisClient: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    setEx: vi.fn(),
  }),
}));

import { experimentService } from './experiment.service';

describe('ExperimentService', () => {
  it('should assign variant deterministically', async () => {
    const experiment = {
      id: 'exp-1', name: 'rec-weights', status: 'running',
      variants: [
        { name: 'control', weight: 50, config: { trending: 0.3 } },
        { name: 'treatment', weight: 50, config: { trending: 0.7 } },
      ],
    };

    const variant1 = experimentService.assignVariant('user-1', experiment as any);
    const variant2 = experimentService.assignVariant('user-1', experiment as any);
    expect(variant1).toBe(variant2); // deterministic

    // Different user may get different variant
    const variant3 = experimentService.assignVariant('user-2', experiment as any);
    expect(['control', 'treatment']).toContain(variant3);
  });

  it('should return variant config', async () => {
    // ... test getVariantConfig
  });
});
```

**Step 2: Implement experiment service**

```typescript
// src/server/services/experiment.service.ts
import crypto from 'crypto';
import { experimentRepository } from '../../db/repositories/experiment.repository';
import { getRedisClient } from '../../core/redis';
import type { Experiment } from '../../db/schema/experiments';

export const experimentService = {
  /**
   * Deterministic variant assignment via hash(userId + experimentName).
   */
  assignVariant(userId: string, experiment: Experiment): string {
    const hash = crypto.createHash('md5').update(`${userId}:${experiment.name}`).digest();
    const value = hash.readUInt32BE(0);
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    const target = value % totalWeight;

    let cumulative = 0;
    for (const variant of experiment.variants) {
      cumulative += variant.weight;
      if (target < cumulative) return variant.name;
    }
    return experiment.variants[0].name;
  },

  async getVariantConfig(userId: string, experimentName: string): Promise<Record<string, unknown> | null> {
    const redis = await getRedisClient();
    const cacheKey = `exp:${experimentName}:${userId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const experiment = await experimentRepository.findByName(experimentName);
    if (!experiment || experiment.status !== 'running') return null;

    const variantName = this.assignVariant(userId, experiment);
    const variant = experiment.variants.find((v) => v.name === variantName);
    if (!variant) return null;

    const result = { variant: variantName, ...variant.config };
    await redis.setEx(cacheKey, 3600, JSON.stringify(result));
    return result;
  },

  async getActiveExperiments(): Promise<Experiment[]> {
    return experimentRepository.findActive();
  },
};
```

**Step 3: Implement experiment analysis service**

```typescript
// src/server/services/experiment-analysis.service.ts
// Queries ClickHouse dwd_recommendation_events for per-variant metrics
import { analyticsQueryService } from './analytics-query.service';

export const experimentAnalysisService = {
  async getExperimentResults(experimentId: string): Promise<{
    variants: Array<{
      name: string;
      impressions: number;
      clicks: number;
      chatStarts: number;
      ctr: number;
    }>;
  }> {
    // Query ClickHouse: SELECT variant, action, count() FROM dwd_recommendation_events WHERE experiment_id = ? GROUP BY variant, action
    // ... implementation
  },
};
```

**Step 4: Run tests and commit**

```bash
git add src/server/services/experiment.service.ts src/server/services/experiment-analysis.service.ts src/server/services/experiment.spec.ts
git commit -m "feat(experiments): add experiment service with deterministic variant assignment"
```

---

### Task 12: Experiment API + Admin Page

**Files:**
- Create: `src/server/routes/admin/experiments.ts`
- Modify: `src/server/routes/admin/index.ts` (mount)
- Create: `src/client/pages/admin/Experiments.vue`
- Modify: `src/client/router/routes.ts` (add admin child route)
- Modify: `src/client/pages/admin/AdminLayout.vue` (add sidebar item)
- Test: `src/server/routes/admin/experiments.spec.ts`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**Step 1: Create admin experiment routes**

```typescript
// src/server/routes/admin/experiments.ts
import { Hono } from 'hono';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { experimentRepository } from '../../../db/repositories/experiment.repository';
import { experimentService } from '../../services/experiment.service';
import { experimentAnalysisService } from '../../services/experiment-analysis.service';
import type { ApiResponse } from '../../../types/api';

export const adminExperimentRoutes = new Hono();

// List experiments
adminExperimentRoutes.get('/', authMiddleware(), requireRole('admin'), async (c) => {
  const user = c.get('user');
  const experiments = await experimentRepository.findByTenant(user.tenantId);
  return c.json<ApiResponse>({ success: true, data: experiments, meta: { timestamp: new Date().toISOString() } });
});

// Create experiment
adminExperimentRoutes.post('/', authMiddleware(), requireRole('admin'), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const experiment = await experimentRepository.create({ ...body, tenantId: user.tenantId });
  return c.json<ApiResponse>({ success: true, data: experiment, meta: { timestamp: new Date().toISOString() } }, 201);
});

// Update experiment (start/stop)
adminExperimentRoutes.patch('/:id', authMiddleware(), requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const updates: any = { ...body };
  if (body.status === 'running') updates.startedAt = new Date();
  if (body.status === 'completed') updates.endedAt = new Date();
  const experiment = await experimentRepository.update(id, updates);
  return c.json<ApiResponse>({ success: true, data: experiment, meta: { timestamp: new Date().toISOString() } });
});

// Get experiment results
adminExperimentRoutes.get('/:id/results', authMiddleware(), requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const results = await experimentAnalysisService.getExperimentResults(id);
  return c.json<ApiResponse>({ success: true, data: results, meta: { timestamp: new Date().toISOString() } });
});
```

**Step 2: Mount in admin/index.ts**

```typescript
import { adminExperimentRoutes } from './experiments';
adminRoutes.route('/experiments', adminExperimentRoutes);
```

**Step 3: Create Experiments.vue admin page**

- el-table listing experiments (name, status, variants, dates)
- el-dialog for creating new experiment (name, description, variants with weight + config JSON)
- Start/Stop buttons
- Results view with basic el-progress bars for CTR per variant

**Step 4: Add route and sidebar item**

In `routes.ts`, add admin child:
```typescript
const loadAdminExperiments = () => import(/* webpackChunkName: "admin" */ '../pages/admin/Experiments.vue');
{ path: 'experiments', name: 'AdminExperiments', component: loadAdminExperiments, meta: { requiresAuth: true, requiresRole: 'admin' } },
```

In `AdminLayout.vue`, add to menuItems:
```typescript
{ path: '/admin/experiments', icon: TrendCharts, label: t('admin.nav.experiments') },
```

**Step 5: Write tests and commit**

```bash
git add src/server/routes/admin/experiments.ts src/server/routes/admin/experiments.spec.ts src/server/routes/admin/index.ts src/client/pages/admin/Experiments.vue src/client/router/routes.ts src/client/pages/admin/AdminLayout.vue src/client/i18n/
git commit -m "feat(experiments): add admin experiment management API and UI"
```

---

### Task 13: Experiment ↔ Recommendation Integration

**Files:**
- Modify: `src/server/services/recommendation.service.ts` (read weights from experiment)
- Test: `src/server/services/recommendation-experiment.spec.ts`

**Step 1: Write the failing test**

```typescript
describe('Recommendation + Experiment integration', () => {
  it('should use experiment weights when experiment is active', async () => {
    vi.mocked(experimentService.getVariantConfig).mockResolvedValue({
      variant: 'treatment',
      trending: 0.7,
      collaborative: 0.2,
      contentBased: 0.1,
    });

    const result = await recommendationService.getPersonalized('user-1', 10);
    // Verify trending items have higher weight
    expect(experimentService.getVariantConfig).toHaveBeenCalledWith('user-1', 'recommendation-weights');
  });
});
```

**Step 2: Modify getPersonalized to check for active experiment**

In `recommendation.service.ts`, at the start of `getPersonalized`:

```typescript
import { experimentService } from './experiment.service';

// Inside getPersonalized, before using default weights:
const expConfig = await experimentService.getVariantConfig(userId, 'recommendation-weights');
const w = expConfig
  ? { trending: Number(expConfig.trending ?? 0.3), collaborative: Number(expConfig.collaborative ?? 0.4), contentBased: Number(expConfig.contentBased ?? 0.3) }
  : (weights ?? { trending: 0.3, collaborative: 0.4, contentBased: 0.3 });
```

**Step 3: Run tests and commit**

```bash
git add src/server/services/recommendation.service.ts src/server/services/recommendation-experiment.spec.ts
git commit -m "feat(recommendations): integrate A/B experiment weights into recommendation scoring"
```

---

## Module 4: Scheduled Jobs & Cleanup

### Task 14: Scheduler Service

**Files:**
- Create: `src/server/services/scheduler.service.ts`
- Test: `src/server/services/scheduler.spec.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SchedulerService } from './scheduler.service';

describe('SchedulerService', () => {
  let scheduler: SchedulerService;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new SchedulerService();
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
  });

  it('should register and run a job', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    scheduler.register('test-job', handler, 1000);
    scheduler.start();

    await vi.advanceTimersByTimeAsync(1100);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should track last run time and status', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    scheduler.register('test-job', handler, 1000);
    scheduler.start();

    await vi.advanceTimersByTimeAsync(1100);
    const status = scheduler.getJobStatus('test-job');
    expect(status?.lastRunAt).toBeDefined();
    expect(status?.lastStatus).toBe('success');
  });

  it('should handle job failures gracefully', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('fail'));
    scheduler.register('failing-job', handler, 1000);
    scheduler.start();

    await vi.advanceTimersByTimeAsync(1100);
    const status = scheduler.getJobStatus('failing-job');
    expect(status?.lastStatus).toBe('error');
    expect(status?.lastError).toBe('fail');
  });

  it('should list all registered jobs', () => {
    scheduler.register('job-a', vi.fn(), 1000);
    scheduler.register('job-b', vi.fn(), 2000);
    const jobs = scheduler.listJobs();
    expect(jobs).toHaveLength(2);
  });

  it('should allow manual trigger', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    scheduler.register('manual-job', handler, 60000);
    await scheduler.runNow('manual-job');
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Implement scheduler service**

```typescript
// src/server/services/scheduler.service.ts

export interface JobStatus {
  name: string;
  intervalMs: number;
  lastRunAt: Date | null;
  lastStatus: 'success' | 'error' | 'pending';
  lastError: string | null;
  runCount: number;
}

type JobHandler = () => Promise<void>;

interface RegisteredJob {
  handler: JobHandler;
  intervalMs: number;
  timerId: ReturnType<typeof setInterval> | null;
  status: JobStatus;
}

export class SchedulerService {
  private jobs = new Map<string, RegisteredJob>();

  register(name: string, handler: JobHandler, intervalMs: number): void {
    this.jobs.set(name, {
      handler,
      intervalMs,
      timerId: null,
      status: {
        name,
        intervalMs,
        lastRunAt: null,
        lastStatus: 'pending',
        lastError: null,
        runCount: 0,
      },
    });
  }

  start(): void {
    for (const [name, job] of this.jobs) {
      job.timerId = setInterval(() => this.executeJob(name), job.intervalMs);
    }
  }

  stop(): void {
    for (const job of this.jobs.values()) {
      if (job.timerId) clearInterval(job.timerId);
      job.timerId = null;
    }
  }

  async runNow(name: string): Promise<void> {
    await this.executeJob(name);
  }

  private async executeJob(name: string): Promise<void> {
    const job = this.jobs.get(name);
    if (!job) return;

    try {
      await job.handler();
      job.status.lastStatus = 'success';
      job.status.lastError = null;
    } catch (err) {
      job.status.lastStatus = 'error';
      job.status.lastError = (err as Error).message;
      console.error(`[Scheduler] Job "${name}" failed:`, err);
    }
    job.status.lastRunAt = new Date();
    job.status.runCount++;
  }

  getJobStatus(name: string): JobStatus | null {
    return this.jobs.get(name)?.status ?? null;
  }

  listJobs(): JobStatus[] {
    return Array.from(this.jobs.values()).map((j) => j.status);
  }
}

export const scheduler = new SchedulerService();
```

**Step 3: Run tests and commit**

```bash
git add src/server/services/scheduler.service.ts src/server/services/scheduler.spec.ts
git commit -m "feat(scheduler): add setInterval-based job scheduler service"
```

---

### Task 15: Register Scheduled Jobs

**Files:**
- Create: `src/server/jobs/index.ts`
- Modify: `src/server/index.ts` (start scheduler)
- Test: `src/server/jobs/jobs.spec.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/gdpr.service', () => ({
  gdprService: { processExpiredDeletions: vi.fn().mockResolvedValue(0) },
}));
vi.mock('../services/audit.service', () => ({
  auditService: { deleteOlderThan: vi.fn().mockResolvedValue(5) },
}));
vi.mock('../../db/repositories/password-reset.repository', () => ({
  passwordResetRepository: { deleteExpired: vi.fn().mockResolvedValue(3) },
}));
vi.mock('../../db/repositories/webhook.repository', () => ({
  webhookRepository: { deleteOldDeliveries: vi.fn().mockResolvedValue(10) },
}));

import { registerJobs } from './index';
import { SchedulerService } from '../services/scheduler.service';

describe('Scheduled Jobs', () => {
  it('should register all 4 jobs', () => {
    const scheduler = new SchedulerService();
    registerJobs(scheduler);
    const jobs = scheduler.listJobs();
    expect(jobs).toHaveLength(4);
    expect(jobs.map(j => j.name)).toEqual([
      'gdpr-deletion',
      'audit-retention',
      'token-cleanup',
      'webhook-cleanup',
    ]);
  });
});
```

**Step 2: Implement job registration**

```typescript
// src/server/jobs/index.ts
import type { SchedulerService } from '../services/scheduler.service';
import { gdprService } from '../services/gdpr.service';
import { auditService } from '../services/audit.service';
import { passwordResetRepository } from '../../db/repositories/password-reset.repository';
import { webhookRepository } from '../../db/repositories/webhook.repository';

const ONE_HOUR = 60 * 60 * 1000;
const SIX_HOURS = 6 * ONE_HOUR;
const ONE_DAY = 24 * ONE_HOUR;

export function registerJobs(scheduler: SchedulerService): void {
  // 1. GDPR: process expired deletions every hour
  scheduler.register('gdpr-deletion', async () => {
    const count = await gdprService.processExpiredDeletions();
    if (count > 0) console.log(`[Job:gdpr-deletion] Deleted ${count} expired accounts`);
  }, ONE_HOUR);

  // 2. Audit log retention: delete logs older than 90 days, daily
  scheduler.register('audit-retention', async () => {
    const cutoff = new Date(Date.now() - 90 * ONE_DAY);
    // Use a system tenant ID or iterate all tenants
    const count = await auditService.deleteOlderThan('system', cutoff);
    if (count > 0) console.log(`[Job:audit-retention] Deleted ${count} old audit logs`);
  }, ONE_DAY);

  // 3. Token cleanup: delete expired password reset tokens every 6 hours
  scheduler.register('token-cleanup', async () => {
    const count = await passwordResetRepository.deleteExpired();
    if (count > 0) console.log(`[Job:token-cleanup] Deleted ${count} expired tokens`);
  }, SIX_HOURS);

  // 4. Webhook delivery cleanup: delete old deliveries every day
  scheduler.register('webhook-cleanup', async () => {
    const cutoff = new Date(Date.now() - 30 * ONE_DAY);
    const count = await webhookRepository.deleteOldDeliveries(cutoff);
    if (count > 0) console.log(`[Job:webhook-cleanup] Deleted ${count} old deliveries`);
  }, ONE_DAY);
}
```

Note: `passwordResetRepository.deleteExpired()` and `webhookRepository.deleteOldDeliveries()` may need to be added. Simple queries:

```typescript
// In password-reset.repository.ts:
async deleteExpired(): Promise<number> {
  const result = await this.db
    .delete(passwordResetTokens)
    .where(lt(passwordResetTokens.expiresAt, new Date()))
    .returning();
  return result.length;
}

// In webhook.repository.ts:
async deleteOldDeliveries(before: Date): Promise<number> {
  const result = await this.db
    .delete(webhookDeliveries)
    .where(lt(webhookDeliveries.createdAt, before))
    .returning();
  return result.length;
}
```

**Step 3: Start scheduler in server/index.ts**

In the `if (process.env.NODE_ENV !== 'test')` block:

```typescript
import { scheduler } from './services/scheduler.service';
import { registerJobs } from './jobs';

// After kafkaBridge.start():
registerJobs(scheduler);
scheduler.start();
console.log('⏰ Scheduler started');
```

**Step 4: Run tests and commit**

```bash
git add src/server/jobs/index.ts src/server/jobs/jobs.spec.ts src/server/index.ts src/db/repositories/password-reset.repository.ts src/db/repositories/webhook.repository.ts
git commit -m "feat(scheduler): register GDPR, audit, token, and webhook cleanup jobs"
```

---

### Task 16: Admin Jobs UI + E2E Tests

**Files:**
- Create: `src/server/routes/admin/jobs.ts`
- Modify: `src/server/routes/admin/index.ts` (mount)
- Modify: `src/client/pages/admin/SystemDashboard.vue` (add jobs section)
- Create: `e2e/technical-debt-recommendations.spec.ts`
- Test: `src/server/routes/admin/jobs.spec.ts`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**Step 1: Create admin jobs routes**

```typescript
// src/server/routes/admin/jobs.ts
import { Hono } from 'hono';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { scheduler } from '../../services/scheduler.service';
import type { ApiResponse } from '../../../types/api';

export const adminJobRoutes = new Hono();

adminJobRoutes.get('/', authMiddleware(), requireRole('admin'), async (c) => {
  const jobs = scheduler.listJobs();
  return c.json<ApiResponse>({ success: true, data: jobs, meta: { timestamp: new Date().toISOString() } });
});

adminJobRoutes.post('/:name/run', authMiddleware(), requireRole('admin'), async (c) => {
  const name = c.req.param('name');
  const status = scheduler.getJobStatus(name);
  if (!status) {
    return c.json<ApiResponse>({ success: false, error: { code: 'NOT_FOUND', message: `Job "${name}" not found` }, meta: { timestamp: new Date().toISOString() } }, 404);
  }
  await scheduler.runNow(name);
  return c.json<ApiResponse>({ success: true, data: scheduler.getJobStatus(name), meta: { timestamp: new Date().toISOString() } });
});
```

**Step 2: Mount in admin/index.ts**

```typescript
import { adminJobRoutes } from './jobs';
adminRoutes.route('/jobs', adminJobRoutes);
```

**Step 3: Add jobs section to SystemDashboard**

Add a "Scheduled Jobs" card showing:
- Job name, interval, last run time, status (success/error badge), run count
- "Run Now" button per job

**Step 4: Write E2E tests**

```typescript
// e2e/technical-debt-recommendations.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Iteration 5: Technical Debt + Recommendations', () => {
  test('recommendation trending endpoint returns data', async ({ request }) => {
    const res = await request.get('/api/v1/recommendations/trending');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('character stats returns favorites count', async ({ request }) => {
    // ... auth + request /characters/stats
  });

  test('admin can list experiments', async ({ request }) => {
    // ... admin auth + GET /admin/experiments
  });

  test('admin can list scheduled jobs', async ({ request }) => {
    // ... admin auth + GET /admin/jobs
  });

  test('WorldBooks page loads', async ({ page }) => {
    // ... login + navigate to /worldbooks
    await expect(page.locator('h1, h2, .page-title')).toBeVisible();
  });

  test('legal pages load', async ({ page }) => {
    await page.goto('/terms');
    await expect(page).toHaveURL(/terms/);
    await page.goto('/privacy');
    await expect(page).toHaveURL(/privacy/);
    await page.goto('/about');
    await expect(page).toHaveURL(/about/);
  });

  test('theme toggle persists', async ({ page }) => {
    // ... login + click theme toggle + verify data-theme attribute
  });
});
```

**Step 5: Write admin jobs route tests and commit**

```bash
git add src/server/routes/admin/jobs.ts src/server/routes/admin/jobs.spec.ts src/server/routes/admin/index.ts src/client/pages/admin/SystemDashboard.vue e2e/technical-debt-recommendations.spec.ts src/client/i18n/
git commit -m "feat(admin): add scheduled jobs API, UI, and E2E tests"
```

---

## Post-Implementation

After all 16 tasks are complete:

1. Run full test suite: `npx vitest run`
2. Run E2E tests: `npx playwright test`
3. Update `CLAUDE.md` with Iteration 5 status
4. Update `ROADMAP.md` with Iteration 5 completion
5. Commit documentation updates
