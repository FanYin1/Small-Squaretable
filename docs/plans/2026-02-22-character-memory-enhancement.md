# Iteration 18: Character Memory Enhancement

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Enhance the character memory system with importance decay, semantic deduplication, LLM-based memory consolidation, cross-session promotion, and configurable retrieval weights.

**Architecture:** Extend the existing `MemoryService` + `MemoryRepository` with: (1) time-based importance decay in the hybrid scoring SQL, (2) embedding cosine similarity check before storing to merge near-duplicates, (3) a new `MemoryConsolidationService` that clusters related memories and summarizes them via LLM, (4) a promotion mechanism that copies high-importance session memories to global scope (null chatId), (5) configurable scoring weights via env vars. A new scheduled job runs consolidation periodically.

**Tech Stack:** PostgreSQL + pgvector, Drizzle ORM, Hono.js, Vitest, LLM (chatCompletion)

---

### Task 1: Add configurable retrieval weights + importance decay to scoring

**Files:**
- Modify: `src/core/config.ts`
- Modify: `src/db/repositories/memory.repository.ts`
- Modify: `src/db/repositories/memory.repository.spec.ts`

**What to do:**

1. In `src/core/config.ts`, add 4 new config values to the Zod schema (around line 78, after `recommendationCacheTtl`):
```ts
  // Memory retrieval scoring weights (must sum to 1.0)
  memorySimilarityWeight: z.coerce.number().default(0.5),
  memoryImportanceWeight: z.coerce.number().default(0.3),
  memoryRecencyWeight: z.coerce.number().default(0.2),
  // Importance decay: halve importance after this many days without access
  memoryDecayHalfLifeDays: z.coerce.number().default(30),
```

And add the env var mappings (around line 134):
```ts
    memorySimilarityWeight: process.env.MEMORY_SIMILARITY_WEIGHT,
    memoryImportanceWeight: process.env.MEMORY_IMPORTANCE_WEIGHT,
    memoryRecencyWeight: process.env.MEMORY_RECENCY_WEIGHT,
    memoryDecayHalfLifeDays: process.env.MEMORY_DECAY_HALF_LIFE_DAYS,
```

2. In `src/db/repositories/memory.repository.ts`, update `hybridSearch` to use configurable weights and exponential decay:

Replace the current scoring SQL (lines 77-92) with:
```ts
  async hybridSearch(params: HybridSearchParams): Promise<MemoryWithScore[]> {
    const { characterId, userId, embedding, chatId, limit = 10 } = params;
    const embeddingStr = `[${embedding.join(',')}]`;

    const wSim = config.memorySimilarityWeight;
    const wImp = config.memoryImportanceWeight;
    const wRec = config.memoryRecencyWeight;
    const halfLifeSec = config.memoryDecayHalfLifeDays * 86400;

    const chatFilter = chatId
      ? sql`AND m.source_chat_id = ${chatId}::uuid`
      : sql``;

    const result = await db.execute(sql`
      SELECT
        m.*,
        (1 - (v.embedding <=> ${embeddingStr}::vector)) as similarity,
        COALESCE(m.importance, 0.5) * POWER(0.5, EXTRACT(EPOCH FROM (NOW() - m.last_accessed)) / ${halfLifeSec}) as decayed_importance,
        GREATEST(0, 1 - EXTRACT(EPOCH FROM (NOW() - m.last_accessed)) / 2592000) as recency,
        (
          ${wSim} * (1 - (v.embedding <=> ${embeddingStr}::vector)) +
          ${wImp} * COALESCE(m.importance, 0.5) * POWER(0.5, EXTRACT(EPOCH FROM (NOW() - m.last_accessed)) / ${halfLifeSec}) +
          ${wRec} * GREATEST(0, 1 - EXTRACT(EPOCH FROM (NOW() - m.last_accessed)) / 2592000)
        ) as score
      FROM character_memories m
      JOIN character_memory_vectors v ON v.memory_id = m.id
      WHERE m.character_id = ${characterId}::uuid
        AND m.user_id = ${userId}::uuid
        ${chatFilter}
      ORDER BY score DESC
      LIMIT ${limit}
    `);

    return result as unknown as MemoryWithScore[];
  }
```

Key changes:
- Weights are now configurable (`wSim`, `wImp`, `wRec`)
- Importance uses exponential decay: `importance * 0.5^(age_seconds / half_life_seconds)`
- Recency is clamped to `GREATEST(0, ...)` to avoid negative values
- Returns `similarity`, `decayed_importance`, `recency` as separate columns for debug

3. Update `MemoryWithScore` interface to include the new fields:
```ts
export interface MemoryWithScore extends CharacterMemory {
  score: number;
  similarity?: number;
  decayedImportance?: number;
  recency?: number;
}
```

4. Update `memory.repository.spec.ts` — add a test verifying the config import doesn't break, and that `hybridSearch` still returns the expected shape.

Run: `npx tsc --noEmit 2>&1 | grep -E 'memory\.repository|config'` — should be clean.

**Commit:** `feat(memory): add configurable retrieval weights and importance decay scoring`

---

### Task 2: Add semantic deduplication on memory storage

**Files:**
- Modify: `src/db/repositories/memory.repository.ts`
- Modify: `src/server/services/memory.service.ts`
- Modify: `src/server/services/memory.service.spec.ts`

**What to do:**

1. In `memory.repository.ts`, add a `findSimilar` method that checks for near-duplicate memories using vector cosine similarity:

```ts
  async findSimilar(
    characterId: string,
    userId: string,
    embedding: number[],
    threshold = 0.85,
    limit = 5
  ): Promise<Array<CharacterMemory & { similarity: number }>> {
    const embeddingStr = `[${embedding.join(',')}]`;

    const result = await db.execute(sql`
      SELECT m.*, (1 - (v.embedding <=> ${embeddingStr}::vector)) as similarity
      FROM character_memories m
      JOIN character_memory_vectors v ON v.memory_id = m.id
      WHERE m.character_id = ${characterId}::uuid
        AND m.user_id = ${userId}::uuid
        AND (1 - (v.embedding <=> ${embeddingStr}::vector)) >= ${threshold}
      ORDER BY similarity DESC
      LIMIT ${limit}
    `);

    return result as unknown as Array<CharacterMemory & { similarity: number }>;
  }
```

2. In `memory.repository.ts`, add an `updateContent` method for merging:
```ts
  async updateContent(memoryId: string, content: string, importance: string): Promise<void> {
    await db
      .update(characterMemories)
      .set({ content, importance, lastAccessed: new Date() })
      .where(eq(characterMemories.id, memoryId));
  }

  async updateVector(memoryId: string, embedding: number[]): Promise<void> {
    await db
      .update(characterMemoryVectors)
      .set({ embedding })
      .where(eq(characterMemoryVectors.memoryId, memoryId));
  }
```

3. In `memory.service.ts`, modify `storeMemory` to check for semantic duplicates before creating:

```ts
  async storeMemory(
    characterId: string,
    userId: string,
    memory: MemoryFact,
    chatId?: string,
    subscriptionTier = 'free'
  ): Promise<void> {
    // Generate embedding first (needed for both dedup check and storage)
    const embedding = await embeddingService.embed(memory.content);

    // Check for semantic duplicates (similarity >= 0.85)
    const similar = await memoryRepository.findSimilar(
      characterId, userId, embedding, 0.85, 1
    );

    if (similar.length > 0) {
      const existing = similar[0];
      // Merge: keep the longer/newer content, boost importance
      const mergedImportance = Math.min(1, Math.max(
        memory.importance,
        Number(existing.importance ?? 0.5)
      ) + 0.1);

      const mergedContent = memory.content.length > existing.content.length
        ? memory.content
        : existing.content;

      await memoryRepository.updateContent(existing.id, mergedContent, String(mergedImportance));
      await memoryRepository.updateVector(existing.id, embedding);
      return;
    }

    // Check memory limit
    const currentCount = await memoryRepository.countByCharacterUser(characterId, userId);
    const limit = MEMORY_LIMITS[subscriptionTier] ?? MEMORY_LIMITS.free;

    if (currentCount >= limit) {
      await memoryRepository.deleteOldest(characterId, userId, 1);
    }

    // Create memory record
    const created = await memoryRepository.create({
      characterId,
      userId,
      type: memory.type,
      content: memory.content,
      importance: String(memory.importance),
      sourceChatId: chatId,
    });

    // Store embedding
    await memoryRepository.createVector({
      memoryId: created.id,
      embedding,
    });
  }
```

4. Update `memory.service.spec.ts` — add tests:
- "should merge with existing memory when similarity >= 0.85"
- "should create new memory when no similar memory exists"
- "should boost importance on merge (capped at 1.0)"
- "should keep longer content on merge"

Mock `memoryRepository.findSimilar` to return either empty array or a matching memory.

Run: `npx vitest run src/server/services/memory.service.spec.ts`

**Commit:** `feat(memory): add semantic deduplication on memory storage`

---

### Task 3: Create memory consolidation service

**Files:**
- Create: `src/server/services/memory-consolidation.service.ts`
- Create: `src/server/services/memory-consolidation.service.spec.ts`

**What to do:**

Create a `MemoryConsolidationService` that clusters related memories and summarizes them via LLM.

1. Create `src/server/services/memory-consolidation.service.ts`:

```ts
import { memoryRepository } from '../../db/repositories/memory.repository';
import { embeddingService } from './embedding.service';
import { llmService } from './llm.service';
import { getDefaultModel } from '../config/llm.config';
import { logger } from './logger.service';
import type { CharacterMemory } from '../../db/schema/memories';

const consolidationLogger = logger.child({ module: 'memory-consolidation' });

export interface ConsolidationResult {
  clustersFound: number;
  memoriesConsolidated: number;
  summariesCreated: number;
}

export class MemoryConsolidationService {
  /**
   * Consolidate memories for a character-user pair.
   * Groups similar memories into clusters, summarizes each cluster via LLM,
   * replaces the cluster with a single consolidated memory.
   */
  async consolidate(
    characterId: string,
    userId: string,
    similarityThreshold = 0.75,
    minClusterSize = 3
  ): Promise<ConsolidationResult> {
    // 1. Fetch all memories with embeddings
    const memories = await memoryRepository.findByCharacterAndUser(
      characterId, userId, 500
    );

    if (memories.length < minClusterSize) {
      return { clustersFound: 0, memoriesConsolidated: 0, summariesCreated: 0 };
    }

    // 2. Build clusters using greedy similarity grouping
    const clusters = await this.clusterMemories(
      memories, characterId, userId, similarityThreshold, minClusterSize
    );

    let memoriesConsolidated = 0;
    let summariesCreated = 0;

    // 3. For each cluster, summarize and replace
    for (const cluster of clusters) {
      try {
        const summary = await this.summarizeCluster(cluster);
        if (!summary) continue;

        // Determine consolidated type (most common type in cluster)
        const typeCount = new Map<string, number>();
        for (const m of cluster) {
          typeCount.set(m.type, (typeCount.get(m.type) ?? 0) + 1);
        }
        const dominantType = [...typeCount.entries()]
          .sort((a, b) => b[1] - a[1])[0][0];

        // Max importance from cluster, boosted slightly
        const maxImportance = Math.min(1,
          Math.max(...cluster.map(m => Number(m.importance ?? 0.5))) + 0.1
        );

        // Delete old memories in cluster
        for (const m of cluster) {
          await memoryRepository.delete(m.id);
        }

        // Create consolidated memory
        const created = await memoryRepository.create({
          characterId,
          userId,
          type: dominantType,
          content: summary,
          importance: String(maxImportance),
        });

        // Generate and store embedding for the summary
        const embedding = await embeddingService.embed(summary);
        await memoryRepository.createVector({
          memoryId: created.id,
          embedding,
        });

        memoriesConsolidated += cluster.length;
        summariesCreated++;
      } catch (error) {
        consolidationLogger.error('Failed to consolidate cluster', error as Error);
      }
    }

    return {
      clustersFound: clusters.length,
      memoriesConsolidated,
      summariesCreated,
    };
  }

  /**
   * Greedy clustering: for each unvisited memory, find all similar memories
   * and form a cluster if size >= minClusterSize.
   */
  private async clusterMemories(
    memories: CharacterMemory[],
    characterId: string,
    userId: string,
    threshold: number,
    minClusterSize: number
  ): Promise<CharacterMemory[][]> {
    const visited = new Set<string>();
    const clusters: CharacterMemory[][] = [];

    for (const memory of memories) {
      if (visited.has(memory.id)) continue;

      const embedding = await embeddingService.embed(memory.content);
      const similar = await memoryRepository.findSimilar(
        characterId, userId, embedding, threshold, 20
      );

      const cluster = similar
        .filter(s => !visited.has(s.id))
        .map(s => memories.find(m => m.id === s.id)!)
        .filter(Boolean);

      if (cluster.length >= minClusterSize) {
        for (const m of cluster) visited.add(m.id);
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * Summarize a cluster of related memories into a single concise memory.
   */
  private async summarizeCluster(cluster: CharacterMemory[]): Promise<string | null> {
    const memoryTexts = cluster.map(m => `- [${m.type}] ${m.content}`).join('\n');

    const prompt = `以下是关于同一用户的多条相关记忆，请将它们合并为一条简洁的综合记忆。
保留所有重要信息，去除重复内容。输出一段话，不要使用列表格式。

记忆列表:
${memoryTexts}

合并后的记忆:`;

    try {
      const response = await llmService.chatCompletion({
        model: getDefaultModel() || 'glm-4.5-air',
        messages: [
          { role: 'system', content: 'You are a memory consolidation assistant. Output a single concise paragraph.' },
          { role: 'user', content: prompt },
        ],
        stream: false,
        temperature: 0.3,
        n: 1,
        presence_penalty: 0,
        frequency_penalty: 0,
      });

      return response.choices[0]?.message?.content?.trim() ?? null;
    } catch (error) {
      consolidationLogger.error('Failed to summarize cluster', error as Error);
      return null;
    }
  }
}

export const memoryConsolidationService = new MemoryConsolidationService();
```

2. Create `src/server/services/memory-consolidation.service.spec.ts` with tests:
- "should skip consolidation when fewer memories than minClusterSize"
- "should find clusters of similar memories and consolidate them"
- "should use dominant type from cluster"
- "should boost max importance by 0.1 (capped at 1.0)"
- "should handle LLM summarization failure gracefully"
- "should delete original memories and create consolidated one"
- "should not cluster already-visited memories"

Mock `memoryRepository`, `embeddingService`, and `llmService`.

Run: `npx vitest run src/server/services/memory-consolidation.service.spec.ts`

**Commit:** `feat(memory): add memory consolidation service with LLM summarization`

---

### Task 4: Add cross-session memory promotion

**Files:**
- Modify: `src/server/services/memory.service.ts`
- Modify: `src/db/repositories/memory.repository.ts`
- Modify: `src/server/services/memory.service.spec.ts`

**What to do:**

1. In `memory.repository.ts`, add a method to find high-importance session memories eligible for promotion:

```ts
  async findPromotionCandidates(
    characterId: string,
    userId: string,
    minImportance = 0.7,
    minAccessCount = 2
  ): Promise<CharacterMemory[]> {
    return await db
      .select()
      .from(characterMemories)
      .where(
        and(
          eq(characterMemories.characterId, characterId),
          eq(characterMemories.userId, userId),
          sql`${characterMemories.sourceChatId} IS NOT NULL`,
          sql`CAST(${characterMemories.importance} AS NUMERIC) >= ${minImportance}`,
          sql`${characterMemories.accessCount} >= ${minAccessCount}`,
        )
      )
      .orderBy(desc(characterMemories.importance))
      .limit(50);
  }
```

2. In `memory.repository.ts`, add a method to promote a memory (set sourceChatId to null):

```ts
  async promoteToGlobal(memoryId: string): Promise<void> {
    await db
      .update(characterMemories)
      .set({ sourceChatId: null })
      .where(eq(characterMemories.id, memoryId));
  }
```

3. In `memory.service.ts`, add a `promoteSessionMemories` method:

```ts
  async promoteSessionMemories(
    characterId: string,
    userId: string,
    minImportance = 0.7,
    minAccessCount = 2
  ): Promise<{ promoted: number; skipped: number }> {
    const candidates = await memoryRepository.findPromotionCandidates(
      characterId, userId, minImportance, minAccessCount
    );

    let promoted = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      // Check if a similar global memory already exists
      const embedding = await embeddingService.embed(candidate.content);
      const similar = await memoryRepository.findSimilar(
        characterId, userId, embedding, 0.85, 1
      );

      // If a global (no chatId) similar memory exists, skip
      const hasGlobalDuplicate = similar.some(s =>
        s.id !== candidate.id && !s.sourceChatId
      );

      if (hasGlobalDuplicate) {
        skipped++;
        continue;
      }

      await memoryRepository.promoteToGlobal(candidate.id);
      promoted++;
    }

    return { promoted, skipped };
  }
```

4. Update `memory.service.spec.ts` — add tests:
- "should promote high-importance session memories to global scope"
- "should skip promotion when similar global memory exists"
- "should respect minImportance and minAccessCount thresholds"
- "should return correct promoted/skipped counts"

Run: `npx vitest run src/server/services/memory.service.spec.ts`

**Commit:** `feat(memory): add cross-session memory promotion`

---

### Task 5: Add memory consolidation scheduled job

**Files:**
- Modify: `src/server/jobs/index.ts`
- Modify: `src/server/services/memory-consolidation.service.ts`

**What to do:**

1. In `memory-consolidation.service.ts`, add a `consolidateAll` method that processes all active character-user pairs:

```ts
  /**
   * Run consolidation for all character-user pairs that have enough memories.
   * Called by the scheduled job.
   */
  async consolidateAll(minMemoryCount = 10): Promise<{ pairs: number; totalConsolidated: number }> {
    const pairs = await memoryRepository.findActiveCharacterUserPairs(minMemoryCount);
    let totalConsolidated = 0;

    for (const pair of pairs) {
      try {
        const result = await this.consolidate(pair.characterId, pair.userId);
        totalConsolidated += result.memoriesConsolidated;
      } catch (error) {
        consolidationLogger.error('Consolidation failed for pair', {
          characterId: pair.characterId,
          userId: pair.userId,
          error: (error as Error).message,
        });
      }
    }

    return { pairs: pairs.length, totalConsolidated };
  }
```

2. In `memory.repository.ts`, add `findActiveCharacterUserPairs`:

```ts
  async findActiveCharacterUserPairs(
    minMemoryCount = 10
  ): Promise<Array<{ characterId: string; userId: string }>> {
    const result = await db
      .select({
        characterId: characterMemories.characterId,
        userId: characterMemories.userId,
      })
      .from(characterMemories)
      .groupBy(characterMemories.characterId, characterMemories.userId)
      .having(sql`count(*) >= ${minMemoryCount}`);

    return result;
  }
```

3. In `src/server/jobs/index.ts`, add the consolidation job (import at top):

```ts
import { memoryConsolidationService } from '../services/memory-consolidation.service';
import { memoryService } from '../services/memory.service';
```

Add inside `registerJobs`:
```ts
  scheduler.register('memory-consolidation', async () => {
    const result = await memoryConsolidationService.consolidateAll();
    if (result.totalConsolidated > 0) {
      jobLogger.info('Memory consolidation complete', {
        job: 'memory-consolidation',
        pairs: result.pairs,
        consolidated: result.totalConsolidated,
      });
    }
  }, ONE_DAY);

  scheduler.register('memory-promotion', async () => {
    // Promote session memories for all active pairs
    const pairs = await memoryRepository.findActiveCharacterUserPairs(5);
    let totalPromoted = 0;
    for (const pair of pairs) {
      const result = await memoryService.promoteSessionMemories(
        pair.characterId, pair.userId
      );
      totalPromoted += result.promoted;
    }
    if (totalPromoted > 0) {
      jobLogger.info('Memory promotion complete', {
        job: 'memory-promotion',
        promoted: totalPromoted,
      });
    }
  }, SIX_HOURS);
```

Also add the import for `memoryRepository`:
```ts
import { memoryRepository } from '../../db/repositories/memory.repository';
```

Run: `npx tsc --noEmit 2>&1 | grep -E 'jobs/index|memory-consolidation'` — should be clean.

**Commit:** `feat(memory): add consolidation and promotion scheduled jobs`

---

### Task 6: Add API endpoints for consolidation and promotion

**Files:**
- Modify: `src/server/routes/intelligence.ts`

**What to do:**

Add 2 new endpoints to the intelligence routes:

1. `POST /characters/:characterId/intelligence/consolidate` — trigger manual memory consolidation:

```ts
intelligenceRoutes.post('/:characterId/intelligence/consolidate', authMiddleware(), async (c) => {
  const user = c.get('user');
  const { characterId } = c.req.param();

  const result = await memoryConsolidationService.consolidate(characterId, user.id);

  return c.json({
    success: true,
    data: result,
  });
});
```

2. `POST /characters/:characterId/intelligence/promote` — trigger manual memory promotion:

```ts
intelligenceRoutes.post('/:characterId/intelligence/promote', authMiddleware(), async (c) => {
  const user = c.get('user');
  const { characterId } = c.req.param();

  const result = await memoryService.promoteSessionMemories(characterId, user.id);

  return c.json({
    success: true,
    data: result,
  });
});
```

Add imports at top of file:
```ts
import { memoryConsolidationService } from '../services/memory-consolidation.service';
```

Run: `npx tsc --noEmit 2>&1 | grep 'intelligence.ts'` — should be clean.

**Commit:** `feat(api): add memory consolidation and promotion endpoints`

---

### Task 7: Update ScoredMemory mapping + debug service

**Files:**
- Modify: `src/server/services/memory.service.ts`
- Modify: `src/server/services/intelligence-debug.service.ts`

**What to do:**

1. In `memory.service.ts`, update `retrieveMemories` to pass through the new scoring fields from the updated `hybridSearch`:

```ts
  async retrieveMemories(query: MemoryQuery): Promise<ScoredMemory[]> {
    const { characterId, userId, query: queryText, chatId, limit = 10 } = query;

    const embedding = await embeddingService.embed(queryText);

    const memories = await memoryRepository.hybridSearch({
      characterId,
      userId,
      embedding,
      chatId,
      limit,
    });

    const memoryIds = memories.map((m) => m.id);
    await memoryRepository.updateAccessTimeBatch(memoryIds);

    return memories.map((m) => ({
      id: m.id,
      content: m.content,
      type: m.type,
      score: m.score,
      similarity: (m as any).similarity,
      importanceScore: (m as any).decayedImportance ?? (m as any).decayed_importance,
      recencyScore: (m as any).recency,
    }));
  }
```

2. In `intelligence-debug.service.ts`, update the `MemoryRetrievalResult` interface (if not already matching) and ensure `recordRetrieval` stores the new fields. The existing interface already has `similarity`, `importance`, `recency` — just verify the data flows through.

3. Update the `IntelligenceDebugState.memoryStats` to include consolidation info:

Add to the `memoryStats` type:
```ts
memoryStats: {
  total: number;
  byType: Record<string, number>;
  lastExtractedAt: string | null;
  globalCount?: number;    // memories with no chatId (promoted)
  sessionCount?: number;   // memories with chatId
};
```

In `getDebugState`, compute `globalCount` and `sessionCount` from the memories list.

Run: `npx vitest run src/server/services/memory.service.spec.ts`

**Commit:** `feat(memory): pass decay scoring fields through to debug service`

---

### Task 8: Update frontend store for consolidation + promotion

**Files:**
- Modify: `src/client/stores/characterIntelligence.ts`
- Modify: `src/client/stores/characterIntelligence.spec.ts`

**What to do:**

1. In `characterIntelligence.ts`, add actions for the new endpoints:

```ts
  async consolidateMemories(characterId: string): Promise<ConsolidationResult> {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await apiClient.post(
        `/api/v1/characters/${characterId}/intelligence/consolidate`
      );
      // Refresh memories after consolidation
      await fetchMemories(characterId);
      return response.data.data;
    } catch (err: any) {
      error.value = err.message;
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async promoteMemories(characterId: string): Promise<{ promoted: number; skipped: number }> {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await apiClient.post(
        `/api/v1/characters/${characterId}/intelligence/promote`
      );
      await fetchMemories(characterId);
      return response.data.data;
    } catch (err: any) {
      error.value = err.message;
      throw err;
    } finally {
      isLoading.value = false;
    }
  }
```

2. Add a computed for memory scope breakdown:
```ts
  const globalMemories = computed(() =>
    memories.value.filter(m => !m.sourceChatId)
  );
  const sessionMemories = computed(() =>
    memories.value.filter(m => !!m.sourceChatId)
  );
```

3. Export the new actions and computed from the store's return object.

4. Update `characterIntelligence.spec.ts` — add tests:
- "consolidateMemories should call API and refresh memories"
- "consolidateMemories should set error on failure"
- "promoteMemories should call API and refresh memories"
- "globalMemories should filter memories without sourceChatId"
- "sessionMemories should filter memories with sourceChatId"

Run: `npx vitest run src/client/stores/characterIntelligence.spec.ts`

**Commit:** `feat(client): add consolidation and promotion actions to intelligence store`

---

### Task 9: Add i18n keys for memory enhancement features

**Files:**
- Modify: `src/client/locales/en-US.json`
- Modify: `src/client/locales/zh-CN.json`

**What to do:**

Add i18n keys under a `memory` section (or extend existing memory-related keys):

en-US.json:
```json
{
  "memory": {
    "consolidate": "Consolidate memories",
    "consolidating": "Consolidating...",
    "consolidateSuccess": "Consolidated {count} memories into {summaries} summaries",
    "consolidateEmpty": "No memories to consolidate",
    "promote": "Promote to global",
    "promoting": "Promoting...",
    "promoteSuccess": "Promoted {count} memories, skipped {skipped}",
    "promoteEmpty": "No memories eligible for promotion",
    "global": "Global",
    "session": "Session",
    "importance": "Importance",
    "decayedImportance": "Effective importance",
    "similarity": "Similarity",
    "recency": "Recency",
    "accessCount": "Access count",
    "lastAccessed": "Last accessed"
  }
}
```

zh-CN.json:
```json
{
  "memory": {
    "consolidate": "整合记忆",
    "consolidating": "整合中...",
    "consolidateSuccess": "已将 {count} 条记忆整合为 {summaries} 条摘要",
    "consolidateEmpty": "没有可整合的记忆",
    "promote": "提升为全局",
    "promoting": "提升中...",
    "promoteSuccess": "已提升 {count} 条记忆，跳过 {skipped} 条",
    "promoteEmpty": "没有符合提升条件的记忆",
    "global": "全局",
    "session": "会话",
    "importance": "重要性",
    "decayedImportance": "有效重要性",
    "similarity": "相似度",
    "recency": "时效性",
    "accessCount": "访问次数",
    "lastAccessed": "最后访问"
  }
}
```

Run: `npx vitest run 2>&1 | tail -5` — verify no regressions.

**Commit:** `feat(i18n): add memory enhancement translations (en-US + zh-CN)`

---

### Task 10: Final verification and docs update

**What to do:**

1. Run `npx tsc --noEmit` — expect 0 errors
2. Run `npx vitest run` — expect all tests passing (no regressions)
3. Run `npm run build` — expect clean production build
4. Update `ROADMAP.md` — add Iteration 18 entry:
```markdown
### 迭代 18: 角色记忆增强 ✅ (2026-02-22)
- ✅ **重要性衰减** — 指数衰减评分 (半衰期可配置), 可配置检索权重 (相似度/重要性/时效性)
- ✅ **语义去重** — 存储时嵌入余弦相似度检查 (≥0.85), 自动合并近似记忆
- ✅ **记忆整合** — LLM 摘要合并相关记忆簇, 减少记忆数量同时保留知识
- ✅ **跨会话提升** — 高重要性会话记忆自动提升为全局记忆, 去重检查
- ✅ **定时任务** — memory-consolidation (每日) + memory-promotion (每6小时)
- ✅ **API + 前端** — 手动整合/提升端点, 前端 store 操作, 调试面板增强
- ✅ **i18n** — memory.* 键 (en-US + zh-CN)
```

**Commit:** `docs: update ROADMAP.md for Iteration 18 (character memory enhancement)`

---

## Verification

After all tasks:
- `npx tsc --noEmit` — 0 errors
- `npx vitest run` — all tests passing (no regressions)
- `npm run build` — production build succeeds
- Memory importance decays over time in retrieval scoring
- Semantic deduplication merges near-duplicate memories on storage
- Consolidation summarizes clusters of related memories via LLM
- Cross-session promotion moves important session memories to global scope
- Scheduled jobs run consolidation (daily) and promotion (6-hourly)
