# Intelligent Character System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement memory and emotion systems for AI characters, enabling cross-conversation memory and emotional state tracking.

**Architecture:** Three new services (EmbeddingService, MemoryService, EmotionService) integrated with existing ChatService. Uses pgvector for semantic search, MiniLM for embeddings/sentiment, and System Prompt injection for LLM context.

**Tech Stack:** PostgreSQL + pgvector, @xenova/transformers (MiniLM), Drizzle ORM, Hono.js, Vue 3 + Pinia

**Design Document:** `docs/plans/2026-02-05-intelligent-character-system-design.md`

**Worktree:** `/var/aichat/Small-Squaretable/.worktrees/intelligent-character-system`

---

## Phase 1: Infrastructure

### Task 1: Install pgvector Extension

**Files:**
- Create: `src/db/migrations/0010_add_pgvector.sql`

**Step 1: Create migration file for pgvector**

```sql
-- 0010_add_pgvector.sql
-- Enable pgvector extension for vector similarity search

CREATE EXTENSION IF NOT EXISTS vector;
```

**Step 2: Run migration**

Run: `npm run db:migrate`
Expected: Migration applies successfully

**Step 3: Verify pgvector is installed**

Run: `psql $DATABASE_URL -c "SELECT * FROM pg_extension WHERE extname = 'vector';"`
Expected: One row showing vector extension

**Step 4: Commit**

```bash
git add src/db/migrations/0010_add_pgvector.sql
git commit -m "feat(db): add pgvector extension for vector similarity search"
```

---

### Task 2: Create Database Schema for Memories

**Files:**
- Create: `src/db/schema/memories.ts`
- Modify: `src/db/schema/index.ts`
- Create: `src/db/migrations/0011_add_character_memories.sql`

**Step 1: Create memories schema file**

```typescript
// src/db/schema/memories.ts
/**
 * Character Memory Schema
 *
 * Stores long-term memories extracted from conversations
 */

import { pgTable, uuid, varchar, text, decimal, integer, timestamp, customType } from 'drizzle-orm/pg-core';
import { characters } from './characters';
import { users } from './users';
import { chats } from './chats';

// Custom type for pgvector
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(384)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value.replace(/^\[/, '[').replace(/\]$/, ']'));
  },
});

export const characterMemories = pgTable('character_memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Memory content
  type: varchar('type', { length: 20 }).notNull(), // 'fact' | 'preference' | 'relationship' | 'event'
  content: text('content').notNull(),

  // Weight factors
  importance: decimal('importance', { precision: 3, scale: 2 }).default('0.5'),
  accessCount: integer('access_count').default(0),

  // Source tracking
  sourceChatId: uuid('source_chat_id').references(() => chats.id, { onDelete: 'set null' }),
  sourceMessageId: integer('source_message_id'),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastAccessed: timestamp('last_accessed', { withTimezone: true }).defaultNow().notNull(),
});

export const characterMemoryVectors = pgTable('character_memory_vectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  memoryId: uuid('memory_id')
    .notNull()
    .references(() => characterMemories.id, { onDelete: 'cascade' }),
  embedding: vector('embedding'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type CharacterMemory = typeof characterMemories.$inferSelect;
export type NewCharacterMemory = typeof characterMemories.$inferInsert;
export type CharacterMemoryVector = typeof characterMemoryVectors.$inferSelect;
export type NewCharacterMemoryVector = typeof characterMemoryVectors.$inferInsert;
```

**Step 2: Update schema index**

Add to `src/db/schema/index.ts`:
```typescript
export * from './memories';
```

**Step 3: Create SQL migration**

```sql
-- src/db/migrations/0011_add_character_memories.sql
-- Character memories table for long-term memory storage

CREATE TABLE character_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  type VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,

  importance DECIMAL(3,2) DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,

  source_chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,
  source_message_id INTEGER,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  CONSTRAINT unique_memory UNIQUE (character_id, user_id, content)
);

CREATE TABLE character_memory_vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES character_memories(id) ON DELETE CASCADE,
  embedding vector(384),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_memories_character_user ON character_memories(character_id, user_id);
CREATE INDEX idx_memories_type ON character_memories(type);
CREATE INDEX idx_memories_importance ON character_memories(importance DESC);
CREATE INDEX idx_memories_last_accessed ON character_memories(last_accessed DESC);

-- HNSW index for fast vector similarity search
CREATE INDEX idx_memory_vectors_embedding ON character_memory_vectors
  USING hnsw (embedding vector_cosine_ops);
```

**Step 4: Run migration**

Run: `npm run db:migrate`
Expected: Tables created successfully

**Step 5: Commit**

```bash
git add src/db/schema/memories.ts src/db/schema/index.ts src/db/migrations/0011_add_character_memories.sql
git commit -m "feat(db): add character_memories and memory_vectors tables"
```

---

### Task 3: Create Database Schema for Emotions

**Files:**
- Create: `src/db/schema/emotions.ts`
- Modify: `src/db/schema/index.ts`
- Create: `src/db/migrations/0012_add_character_emotions.sql`

**Step 1: Create emotions schema file**

```typescript
// src/db/schema/emotions.ts
/**
 * Character Emotion Schema
 *
 * Tracks emotional state using 2D Valence-Arousal model
 */

import { pgTable, uuid, decimal, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { characters } from './characters';
import { users } from './users';
import { chats } from './chats';

export const characterEmotions = pgTable('character_emotions', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  chatId: uuid('chat_id')
    .references(() => chats.id, { onDelete: 'cascade' }),

  // 2D emotion values
  valence: decimal('valence', { precision: 4, scale: 3 }).notNull(), // -1 to 1
  arousal: decimal('arousal', { precision: 4, scale: 3 }).notNull(), // 0 to 1

  // Trigger info
  triggerMessageId: integer('trigger_message_id'),
  triggerContent: text('trigger_content'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type CharacterEmotion = typeof characterEmotions.$inferSelect;
export type NewCharacterEmotion = typeof characterEmotions.$inferInsert;
```

**Step 2: Update schema index**

Add to `src/db/schema/index.ts`:
```typescript
export * from './emotions';
```

**Step 3: Create SQL migration**

```sql
-- src/db/migrations/0012_add_character_emotions.sql
-- Character emotions table for 2D emotion tracking

CREATE TABLE character_emotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,

  valence DECIMAL(4,3) NOT NULL,
  arousal DECIMAL(4,3) NOT NULL,

  trigger_message_id INTEGER,
  trigger_content TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_emotions_character_user ON character_emotions(character_id, user_id);
CREATE INDEX idx_emotions_chat ON character_emotions(chat_id);
CREATE INDEX idx_emotions_created ON character_emotions(created_at DESC);

-- Unique constraint for current emotion per character-user-chat
CREATE UNIQUE INDEX idx_emotions_current ON character_emotions(character_id, user_id, chat_id)
  WHERE chat_id IS NOT NULL;
```

**Step 4: Run migration**

Run: `npm run db:migrate`
Expected: Table created successfully

**Step 5: Commit**

```bash
git add src/db/schema/emotions.ts src/db/schema/index.ts src/db/migrations/0012_add_character_emotions.sql
git commit -m "feat(db): add character_emotions table for 2D emotion tracking"
```

---

### Task 4: Install @xenova/transformers

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

Run: `npm install @xenova/transformers`
Expected: Package installed successfully

**Step 2: Verify installation**

Run: `npm ls @xenova/transformers`
Expected: Shows installed version

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(deps): add @xenova/transformers for local ML inference"
```

---

### Task 5: Create Memory Repository

**Files:**
- Create: `src/db/repositories/memory.repository.ts`

**Step 1: Create the repository file**

```typescript
// src/db/repositories/memory.repository.ts
/**
 * Memory Repository
 *
 * Data access layer for character memories and vectors
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../index';
import { characterMemories, characterMemoryVectors } from '../schema/memories';
import type { CharacterMemory, NewCharacterMemory, NewCharacterMemoryVector } from '../schema/memories';

export interface MemoryWithScore extends CharacterMemory {
  score: number;
}

export interface HybridSearchParams {
  characterId: string;
  userId: string;
  embedding: number[];
  limit?: number;
}

class MemoryRepository {
  async create(data: NewCharacterMemory): Promise<CharacterMemory> {
    const [memory] = await db
      .insert(characterMemories)
      .values(data)
      .onConflictDoUpdate({
        target: [characterMemories.characterId, characterMemories.userId, characterMemories.content],
        set: {
          importance: data.importance,
          lastAccessed: new Date(),
        },
      })
      .returning();
    return memory;
  }

  async createVector(data: NewCharacterMemoryVector): Promise<void> {
    await db.insert(characterMemoryVectors).values(data);
  }

  async findByCharacterAndUser(
    characterId: string,
    userId: string,
    limit = 100
  ): Promise<CharacterMemory[]> {
    return await db
      .select()
      .from(characterMemories)
      .where(
        and(
          eq(characterMemories.characterId, characterId),
          eq(characterMemories.userId, userId)
        )
      )
      .orderBy(desc(characterMemories.lastAccessed))
      .limit(limit);
  }

  async hybridSearch(params: HybridSearchParams): Promise<MemoryWithScore[]> {
    const { characterId, userId, embedding, limit = 10 } = params;
    const embeddingStr = `[${embedding.join(',')}]`;

    // Hybrid scoring: 0.5 * similarity + 0.3 * importance + 0.2 * recency
    const result = await db.execute(sql`
      SELECT
        m.*,
        (
          0.5 * (1 - (v.embedding <=> ${embeddingStr}::vector)) +
          0.3 * COALESCE(m.importance, 0.5) +
          0.2 * (1 - EXTRACT(EPOCH FROM (NOW() - m.last_accessed)) / 2592000)
        ) as score
      FROM character_memories m
      JOIN character_memory_vectors v ON v.memory_id = m.id
      WHERE m.character_id = ${characterId}::uuid
        AND m.user_id = ${userId}::uuid
      ORDER BY score DESC
      LIMIT ${limit}
    `);

    return result.rows as MemoryWithScore[];
  }

  async updateAccessTime(memoryId: string): Promise<void> {
    await db
      .update(characterMemories)
      .set({
        lastAccessed: new Date(),
        accessCount: sql`${characterMemories.accessCount} + 1`,
      })
      .where(eq(characterMemories.id, memoryId));
  }

  async delete(memoryId: string): Promise<void> {
    await db.delete(characterMemories).where(eq(characterMemories.id, memoryId));
  }

  async deleteAllForCharacterUser(characterId: string, userId: string): Promise<void> {
    await db
      .delete(characterMemories)
      .where(
        and(
          eq(characterMemories.characterId, characterId),
          eq(characterMemories.userId, userId)
        )
      );
  }

  async countByCharacterUser(characterId: string, userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(characterMemories)
      .where(
        and(
          eq(characterMemories.characterId, characterId),
          eq(characterMemories.userId, userId)
        )
      );
    return Number(result[0]?.count ?? 0);
  }
}

export const memoryRepository = new MemoryRepository();
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/db/repositories/memory.repository.ts
git commit -m "feat(db): add memory repository with hybrid search"
```

---

### Task 6: Create Emotion Repository

**Files:**
- Create: `src/db/repositories/emotion.repository.ts`

**Step 1: Create the repository file**

```typescript
// src/db/repositories/emotion.repository.ts
/**
 * Emotion Repository
 *
 * Data access layer for character emotions
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../index';
import { characterEmotions } from '../schema/emotions';
import type { CharacterEmotion, NewCharacterEmotion } from '../schema/emotions';

class EmotionRepository {
  async upsert(data: NewCharacterEmotion): Promise<CharacterEmotion> {
    // Use raw SQL for upsert with partial unique index
    const result = await db.execute(sql`
      INSERT INTO character_emotions (
        character_id, user_id, chat_id, valence, arousal, trigger_message_id, trigger_content
      ) VALUES (
        ${data.characterId}::uuid,
        ${data.userId}::uuid,
        ${data.chatId}::uuid,
        ${data.valence},
        ${data.arousal},
        ${data.triggerMessageId ?? null},
        ${data.triggerContent ?? null}
      )
      ON CONFLICT (character_id, user_id, chat_id) WHERE chat_id IS NOT NULL
      DO UPDATE SET
        valence = EXCLUDED.valence,
        arousal = EXCLUDED.arousal,
        trigger_message_id = EXCLUDED.trigger_message_id,
        trigger_content = EXCLUDED.trigger_content,
        created_at = NOW()
      RETURNING *
    `);

    return result.rows[0] as CharacterEmotion;
  }

  async getCurrentEmotion(
    characterId: string,
    userId: string,
    chatId?: string
  ): Promise<CharacterEmotion | null> {
    const conditions = [
      eq(characterEmotions.characterId, characterId),
      eq(characterEmotions.userId, userId),
    ];

    if (chatId) {
      conditions.push(eq(characterEmotions.chatId, chatId));
    }

    const [emotion] = await db
      .select()
      .from(characterEmotions)
      .where(and(...conditions))
      .orderBy(desc(characterEmotions.createdAt))
      .limit(1);

    return emotion ?? null;
  }

  async getHistory(
    characterId: string,
    userId: string,
    limit = 50
  ): Promise<CharacterEmotion[]> {
    return await db
      .select()
      .from(characterEmotions)
      .where(
        and(
          eq(characterEmotions.characterId, characterId),
          eq(characterEmotions.userId, userId)
        )
      )
      .orderBy(desc(characterEmotions.createdAt))
      .limit(limit);
  }

  async deleteForChat(chatId: string): Promise<void> {
    await db.delete(characterEmotions).where(eq(characterEmotions.chatId, chatId));
  }

  async resetForCharacterUser(characterId: string, userId: string): Promise<void> {
    await db
      .delete(characterEmotions)
      .where(
        and(
          eq(characterEmotions.characterId, characterId),
          eq(characterEmotions.userId, userId)
        )
      );
  }
}

export const emotionRepository = new EmotionRepository();
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/db/repositories/emotion.repository.ts
git commit -m "feat(db): add emotion repository"
```

---

## Phase 2: Backend Services

### Task 7: Implement EmbeddingService

**Files:**
- Create: `src/server/services/embedding.service.ts`
- Create: `src/server/services/embedding.service.spec.ts`

**Step 1: Write the failing test**

```typescript
// src/server/services/embedding.service.spec.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { EmbeddingService } from './embedding.service';

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeAll(async () => {
    service = new EmbeddingService();
    await service.initialize();
  }, 60000); // Model loading can take time

  describe('embed', () => {
    it('should generate 384-dimensional embedding', async () => {
      const embedding = await service.embed('Hello world');
      expect(embedding).toHaveLength(384);
      expect(embedding.every(v => typeof v === 'number')).toBe(true);
    });

    it('should generate similar embeddings for similar text', async () => {
      const emb1 = await service.embed('I love programming');
      const emb2 = await service.embed('I enjoy coding');
      const emb3 = await service.embed('The weather is nice');

      const sim12 = cosineSimilarity(emb1, emb2);
      const sim13 = cosineSimilarity(emb1, emb3);

      expect(sim12).toBeGreaterThan(sim13);
    });
  });

  describe('analyzeSentiment', () => {
    it('should return positive valence for positive text', async () => {
      const result = await service.analyzeSentiment('I am so happy today!');
      expect(result.valence).toBeGreaterThan(0);
    });

    it('should return negative valence for negative text', async () => {
      const result = await service.analyzeSentiment('I am very sad and upset');
      expect(result.valence).toBeLessThan(0);
    });
  });
});

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/services/embedding.service.spec.ts`
Expected: FAIL - module not found

**Step 3: Write the implementation**

```typescript
// src/server/services/embedding.service.ts
/**
 * Embedding Service
 *
 * Provides text embedding and sentiment analysis using local ML models
 */

import { pipeline, env, type Pipeline } from '@xenova/transformers';

// Configure model cache directory
env.cacheDir = './models';
env.allowLocalModels = true;

export interface SentimentResult {
  valence: number; // -1 to 1
  arousal: number; // 0 to 1
}

export class EmbeddingService {
  private embeddingPipeline: Pipeline | null = null;
  private sentimentPipeline: Pipeline | null = null;
  private initialized = false;

  private readonly EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
  private readonly SENTIMENT_MODEL = 'Xenova/distilbert-base-uncased-finetuned-sst-2-english';

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('Loading embedding model...');
    this.embeddingPipeline = await pipeline('feature-extraction', this.EMBEDDING_MODEL);

    console.log('Loading sentiment model...');
    this.sentimentPipeline = await pipeline('sentiment-analysis', this.SENTIMENT_MODEL);

    this.initialized = true;
    console.log('EmbeddingService initialized');
  }

  async embed(text: string): Promise<number[]> {
    if (!this.embeddingPipeline) {
      await this.initialize();
    }

    const output = await this.embeddingPipeline!(text, {
      pooling: 'mean',
      normalize: true,
    });

    // Convert to array
    return Array.from(output.data as Float32Array);
  }

  async analyzeSentiment(text: string): Promise<SentimentResult> {
    if (!this.sentimentPipeline) {
      await this.initialize();
    }

    const result = await this.sentimentPipeline!(text);
    const sentiment = result[0] as { label: string; score: number };

    // Convert to valence-arousal
    // POSITIVE -> positive valence, NEGATIVE -> negative valence
    const valence = sentiment.label === 'POSITIVE'
      ? sentiment.score * 2 - 1  // 0.5-1 -> 0-1
      : -(sentiment.score * 2 - 1); // 0.5-1 -> -1-0

    // Arousal estimation based on confidence
    // Higher confidence = higher arousal (more intense emotion)
    const arousal = Math.abs(sentiment.score - 0.5) * 2;

    return {
      valence: Math.max(-1, Math.min(1, valence)),
      arousal: Math.max(0, Math.min(1, arousal)),
    };
  }
}

// Singleton instance
export const embeddingService = new EmbeddingService();
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/services/embedding.service.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/services/embedding.service.ts src/server/services/embedding.service.spec.ts
git commit -m "feat(service): add EmbeddingService for text embedding and sentiment analysis"
```

---

### Task 8: Implement MemoryService

**Files:**
- Create: `src/server/services/memory.service.ts`
- Create: `src/server/services/memory.service.spec.ts`

**Step 1: Write the failing test**

```typescript
// src/server/services/memory.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryService } from './memory.service';

// Mock dependencies
vi.mock('../../db/repositories/memory.repository', () => ({
  memoryRepository: {
    create: vi.fn(),
    createVector: vi.fn(),
    findByCharacterAndUser: vi.fn(),
    hybridSearch: vi.fn(),
    updateAccessTime: vi.fn(),
    delete: vi.fn(),
    deleteAllForCharacterUser: vi.fn(),
    countByCharacterUser: vi.fn(),
  },
}));

vi.mock('./embedding.service', () => ({
  embeddingService: {
    embed: vi.fn().mockResolvedValue(new Array(384).fill(0.1)),
  },
}));

vi.mock('./llm.service', () => ({
  llmService: {
    chat: vi.fn(),
  },
}));

import { memoryRepository } from '../../db/repositories/memory.repository';
import { embeddingService } from './embedding.service';
import { llmService } from './llm.service';

describe('MemoryService', () => {
  let service: MemoryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MemoryService();
  });

  describe('retrieveMemories', () => {
    it('should call hybridSearch with embedding', async () => {
      const mockMemories = [
        { id: '1', content: 'User likes coffee', score: 0.9 },
      ];
      vi.mocked(memoryRepository.hybridSearch).mockResolvedValue(mockMemories as any);

      const result = await service.retrieveMemories({
        characterId: 'char-1',
        userId: 'user-1',
        query: 'What does user like?',
      });

      expect(embeddingService.embed).toHaveBeenCalledWith('What does user like?');
      expect(memoryRepository.hybridSearch).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('storeMemory', () => {
    it('should create memory and vector', async () => {
      vi.mocked(memoryRepository.create).mockResolvedValue({
        id: 'mem-1',
        content: 'User is a programmer',
      } as any);
      vi.mocked(memoryRepository.countByCharacterUser).mockResolvedValue(5);

      await service.storeMemory('char-1', 'user-1', {
        type: 'fact',
        content: 'User is a programmer',
        importance: 0.8,
      });

      expect(memoryRepository.create).toHaveBeenCalled();
      expect(memoryRepository.createVector).toHaveBeenCalled();
      expect(embeddingService.embed).toHaveBeenCalledWith('User is a programmer');
    });
  });

  describe('extractMemories', () => {
    it('should extract memories from messages using LLM', async () => {
      vi.mocked(llmService.chat).mockResolvedValue({
        content: JSON.stringify({
          facts: ['User is a backend developer'],
          preferences: ['Likes TypeScript'],
          relationships: [],
          events: [],
        }),
      } as any);

      const messages = [
        { role: 'user', content: 'I work as a backend developer' },
        { role: 'assistant', content: 'That sounds interesting!' },
      ];

      const result = await service.extractMemories('char-1', 'user-1', messages as any);

      expect(llmService.chat).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('fact');
      expect(result[1].type).toBe('preference');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/services/memory.service.spec.ts`
Expected: FAIL - module not found

**Step 3: Write the implementation**

```typescript
// src/server/services/memory.service.ts
/**
 * Memory Service
 *
 * Manages character memories: retrieval, storage, and extraction
 */

import { memoryRepository, type MemoryWithScore } from '../../db/repositories/memory.repository';
import { embeddingService } from './embedding.service';
import { llmService } from './llm.service';
import type { Message } from '../../db/schema/chats';

export interface MemoryFact {
  type: 'fact' | 'preference' | 'relationship' | 'event';
  content: string;
  importance: number;
}

export interface MemoryQuery {
  characterId: string;
  userId: string;
  query: string;
  limit?: number;
}

export interface ScoredMemory {
  id: string;
  content: string;
  type: string;
  score: number;
}

// Memory limits by subscription tier
const MEMORY_LIMITS: Record<string, number> = {
  free: 100,
  pro: 500,
  team: 2000,
};

export class MemoryService {
  async retrieveMemories(query: MemoryQuery): Promise<ScoredMemory[]> {
    const { characterId, userId, query: queryText, limit = 10 } = query;

    // Generate embedding for query
    const embedding = await embeddingService.embed(queryText);

    // Hybrid search
    const memories = await memoryRepository.hybridSearch({
      characterId,
      userId,
      embedding,
      limit,
    });

    // Update access times
    for (const memory of memories) {
      await memoryRepository.updateAccessTime(memory.id);
    }

    return memories.map((m) => ({
      id: m.id,
      content: m.content,
      type: m.type,
      score: m.score,
    }));
  }

  async storeMemory(
    characterId: string,
    userId: string,
    memory: MemoryFact,
    chatId?: string,
    subscriptionTier = 'free'
  ): Promise<void> {
    // Check memory limit
    const currentCount = await memoryRepository.countByCharacterUser(characterId, userId);
    const limit = MEMORY_LIMITS[subscriptionTier] ?? MEMORY_LIMITS.free;

    if (currentCount >= limit) {
      // TODO: Implement LRU eviction
      console.warn(`Memory limit reached for character ${characterId}, user ${userId}`);
      return;
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

    // Generate and store embedding
    const embedding = await embeddingService.embed(memory.content);
    await memoryRepository.createVector({
      memoryId: created.id,
      embedding,
    });
  }

  async extractMemories(
    characterId: string,
    userId: string,
    messages: Message[]
  ): Promise<MemoryFact[]> {
    if (messages.length === 0) return [];

    // Format messages for LLM
    const conversationText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt = `分析以下对话，提取关于用户的记忆信息。

对话内容:
${conversationText}

请以 JSON 格式输出:
{
  "facts": ["事实性信息..."],
  "preferences": ["用户偏好..."],
  "relationships": ["关系信息..."],
  "events": ["重要事件..."]
}

只提取明确或可合理推断的信息，不要编造。每个类别最多3条。`;

    try {
      const response = await llmService.chat({
        messages: [{ role: 'user', content: prompt }],
        systemPrompt: 'You are a memory extraction assistant. Output valid JSON only.',
      });

      const extracted = JSON.parse(response.content);
      const memories: MemoryFact[] = [];

      // Convert to MemoryFact array
      for (const fact of extracted.facts ?? []) {
        memories.push({ type: 'fact', content: fact, importance: 0.7 });
      }
      for (const pref of extracted.preferences ?? []) {
        memories.push({ type: 'preference', content: pref, importance: 0.6 });
      }
      for (const rel of extracted.relationships ?? []) {
        memories.push({ type: 'relationship', content: rel, importance: 0.8 });
      }
      for (const event of extracted.events ?? []) {
        memories.push({ type: 'event', content: event, importance: 0.5 });
      }

      return memories;
    } catch (error) {
      console.error('Failed to extract memories:', error);
      return [];
    }
  }

  async deleteMemory(memoryId: string): Promise<void> {
    await memoryRepository.delete(memoryId);
  }

  async clearAllMemories(characterId: string, userId: string): Promise<void> {
    await memoryRepository.deleteAllForCharacterUser(characterId, userId);
  }

  async getMemories(characterId: string, userId: string, limit = 100) {
    return await memoryRepository.findByCharacterAndUser(characterId, userId, limit);
  }

  async getMemoryCount(characterId: string, userId: string): Promise<number> {
    return await memoryRepository.countByCharacterUser(characterId, userId);
  }
}

export const memoryService = new MemoryService();
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/services/memory.service.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/services/memory.service.ts src/server/services/memory.service.spec.ts
git commit -m "feat(service): add MemoryService for memory retrieval and extraction"
```

---

### Task 9: Implement EmotionService

**Files:**
- Create: `src/server/services/emotion.service.ts`
- Create: `src/server/services/emotion.service.spec.ts`

**Step 1: Write the failing test**

```typescript
// src/server/services/emotion.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmotionService, EMOTION_MAP } from './emotion.service';

vi.mock('../../db/repositories/emotion.repository', () => ({
  emotionRepository: {
    upsert: vi.fn(),
    getCurrentEmotion: vi.fn(),
    getHistory: vi.fn(),
    resetForCharacterUser: vi.fn(),
  },
}));

vi.mock('./embedding.service', () => ({
  embeddingService: {
    analyzeSentiment: vi.fn(),
  },
}));

import { emotionRepository } from '../../db/repositories/emotion.repository';
import { embeddingService } from './embedding.service';

describe('EmotionService', () => {
  let service: EmotionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EmotionService();
  });

  describe('getEmotionLabel', () => {
    it('should return "happy" for positive valence and medium arousal', () => {
      const label = service.getEmotionLabel(0.5, 0.5);
      expect(label).toBe('happy');
    });

    it('should return "angry" for negative valence and high arousal', () => {
      const label = service.getEmotionLabel(-0.7, 0.8);
      expect(label).toBe('angry');
    });

    it('should return "calm" for neutral valence and low arousal', () => {
      const label = service.getEmotionLabel(0.2, 0.1);
      expect(label).toBe('calm');
    });
  });

  describe('smoothTransition', () => {
    it('should blend current and new emotion', () => {
      const current = { valence: 0.5, arousal: 0.5 };
      const newEmotion = { valence: -0.5, arousal: 0.8 };

      const result = service.smoothTransition(current, newEmotion);

      // 0.7 * 0.5 + 0.3 * (-0.5) = 0.35 - 0.15 = 0.2
      expect(result.valence).toBeCloseTo(0.2, 1);
      // 0.7 * 0.5 + 0.3 * 0.8 = 0.35 + 0.24 = 0.59
      expect(result.arousal).toBeCloseTo(0.59, 1);
    });
  });

  describe('analyzeAndUpdate', () => {
    it('should analyze text and update emotion', async () => {
      vi.mocked(embeddingService.analyzeSentiment).mockResolvedValue({
        valence: 0.6,
        arousal: 0.4,
      });
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue(null);
      vi.mocked(emotionRepository.upsert).mockResolvedValue({
        id: 'emo-1',
        valence: '0.6',
        arousal: '0.4',
      } as any);

      const result = await service.analyzeAndUpdate({
        characterId: 'char-1',
        userId: 'user-1',
        chatId: 'chat-1',
        text: 'I am feeling great!',
      });

      expect(embeddingService.analyzeSentiment).toHaveBeenCalledWith('I am feeling great!');
      expect(emotionRepository.upsert).toHaveBeenCalled();
      expect(result.label).toBeDefined();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/services/emotion.service.spec.ts`
Expected: FAIL - module not found

**Step 3: Write the implementation**

```typescript
// src/server/services/emotion.service.ts
/**
 * Emotion Service
 *
 * Manages character emotional state using 2D Valence-Arousal model
 */

import { emotionRepository } from '../../db/repositories/emotion.repository';
import { embeddingService } from './embedding.service';
import type { CharacterEmotion } from '../../db/schema/emotions';

export interface EmotionState {
  valence: number;
  arousal: number;
  label: string;
  description: string;
}

interface EmotionLabel {
  name: string;
  valence: [number, number]; // [min, max]
  arousal: [number, number]; // [min, max]
}

export const EMOTION_MAP: EmotionLabel[] = [
  { name: 'excited', valence: [0.5, 1], arousal: [0.7, 1] },
  { name: 'happy', valence: [0.3, 0.8], arousal: [0.3, 0.7] },
  { name: 'loving', valence: [0.5, 1], arousal: [0.2, 0.5] },
  { name: 'calm', valence: [0, 0.5], arousal: [0, 0.3] },
  { name: 'curious', valence: [0.1, 0.5], arousal: [0.4, 0.7] },
  { name: 'surprised', valence: [-0.2, 0.5], arousal: [0.6, 1] },
  { name: 'confused', valence: [-0.3, 0.1], arousal: [0.3, 0.6] },
  { name: 'bored', valence: [-0.3, 0], arousal: [0, 0.3] },
  { name: 'sad', valence: [-0.8, -0.2], arousal: [0, 0.4] },
  { name: 'fearful', valence: [-0.7, -0.2], arousal: [0.5, 0.9] },
  { name: 'angry', valence: [-1, -0.4], arousal: [0.6, 1] },
  { name: 'disgusted', valence: [-0.9, -0.4], arousal: [0.3, 0.7] },
];

export interface AnalyzeParams {
  characterId: string;
  userId: string;
  chatId?: string;
  text: string;
  messageId?: number;
}

export class EmotionService {
  getEmotionLabel(valence: number, arousal: number): string {
    // Find best matching emotion
    let bestMatch = 'calm';
    let bestScore = -Infinity;

    for (const emotion of EMOTION_MAP) {
      const vInRange = valence >= emotion.valence[0] && valence <= emotion.valence[1];
      const aInRange = arousal >= emotion.arousal[0] && arousal <= emotion.arousal[1];

      if (vInRange && aInRange) {
        // Calculate how centered the point is in the range
        const vCenter = (emotion.valence[0] + emotion.valence[1]) / 2;
        const aCenter = (emotion.arousal[0] + emotion.arousal[1]) / 2;
        const score = -Math.sqrt(Math.pow(valence - vCenter, 2) + Math.pow(arousal - aCenter, 2));

        if (score > bestScore) {
          bestScore = score;
          bestMatch = emotion.name;
        }
      }
    }

    return bestMatch;
  }

  smoothTransition(
    current: { valence: number; arousal: number },
    newEmotion: { valence: number; arousal: number }
  ): { valence: number; arousal: number } {
    return {
      valence: current.valence * 0.7 + newEmotion.valence * 0.3,
      arousal: current.arousal * 0.7 + newEmotion.arousal * 0.3,
    };
  }

  async analyzeAndUpdate(params: AnalyzeParams): Promise<EmotionState> {
    const { characterId, userId, chatId, text, messageId } = params;

    // Analyze sentiment
    const sentiment = await embeddingService.analyzeSentiment(text);

    // Get current emotion for smooth transition
    const current = await emotionRepository.getCurrentEmotion(characterId, userId, chatId);

    let finalEmotion = sentiment;
    if (current) {
      finalEmotion = this.smoothTransition(
        { valence: Number(current.valence), arousal: Number(current.arousal) },
        sentiment
      );
    }

    // Clamp values
    finalEmotion.valence = Math.max(-1, Math.min(1, finalEmotion.valence));
    finalEmotion.arousal = Math.max(0, Math.min(1, finalEmotion.arousal));

    // Save to database
    await emotionRepository.upsert({
      characterId,
      userId,
      chatId,
      valence: String(finalEmotion.valence),
      arousal: String(finalEmotion.arousal),
      triggerMessageId: messageId,
      triggerContent: text.substring(0, 200),
    });

    const label = this.getEmotionLabel(finalEmotion.valence, finalEmotion.arousal);

    return {
      valence: finalEmotion.valence,
      arousal: finalEmotion.arousal,
      label,
      description: `当前情感: ${label}`,
    };
  }

  async getCurrentEmotion(
    characterId: string,
    userId: string,
    chatId?: string
  ): Promise<EmotionState | null> {
    const emotion = await emotionRepository.getCurrentEmotion(characterId, userId, chatId);
    if (!emotion) return null;

    const valence = Number(emotion.valence);
    const arousal = Number(emotion.arousal);
    const label = this.getEmotionLabel(valence, arousal);

    return {
      valence,
      arousal,
      label,
      description: `当前情感: ${label}`,
    };
  }

  async getEmotionHistory(
    characterId: string,
    userId: string,
    limit = 50
  ): Promise<CharacterEmotion[]> {
    return await emotionRepository.getHistory(characterId, userId, limit);
  }

  async resetEmotion(characterId: string, userId: string): Promise<void> {
    await emotionRepository.resetForCharacterUser(characterId, userId);
  }
}

export const emotionService = new EmotionService();
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/services/emotion.service.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/services/emotion.service.ts src/server/services/emotion.service.spec.ts
git commit -m "feat(service): add EmotionService for 2D emotion tracking"
```

---

### Task 10: Extend ChatService with Memory and Emotion Integration

**Files:**
- Modify: `src/server/services/chat.service.ts`
- Modify: `src/server/services/chat.service.spec.ts`

**Step 1: Add test for enhanced system prompt**

Add to `src/server/services/chat.service.spec.ts`:

```typescript
describe('buildEnhancedSystemPrompt', () => {
  it('should include memories and emotion in system prompt', async () => {
    vi.mocked(memoryService.retrieveMemories).mockResolvedValue([
      { id: '1', content: 'User likes coffee', type: 'preference', score: 0.9 },
    ]);
    vi.mocked(emotionService.getCurrentEmotion).mockResolvedValue({
      valence: 0.5,
      arousal: 0.4,
      label: 'happy',
      description: '当前情感: happy',
    });

    const prompt = await service.buildEnhancedSystemPrompt({
      character: mockCharacter,
      characterId: 'char-1',
      userId: 'user-1',
      chatId: 'chat-1',
      userMessage: 'Hello!',
    });

    expect(prompt).toContain('User likes coffee');
    expect(prompt).toContain('happy');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/services/chat.service.spec.ts`
Expected: FAIL - buildEnhancedSystemPrompt not found

**Step 3: Modify ChatService implementation**

Add to `src/server/services/chat.service.ts`:

```typescript
import { memoryService } from './memory.service';
import { emotionService } from './emotion.service';
import type { Character } from '../../db/schema/characters';

interface EnhancedPromptParams {
  character: Character;
  characterId: string;
  userId: string;
  chatId: string;
  userMessage: string;
}

export class ChatService {
  // ... existing methods ...

  async buildEnhancedSystemPrompt(params: EnhancedPromptParams): Promise<string> {
    const { character, characterId, userId, chatId, userMessage } = params;
    const parts: string[] = [];

    // Base character prompt
    const cardData = character.cardData as Record<string, string> || {};
    parts.push(`You are ${character.name}.`);
    if (character.description) {
      parts.push(character.description);
    }
    if (cardData.personality) {
      parts.push(`Personality: ${cardData.personality}`);
    }
    if (cardData.scenario) {
      parts.push(`Scenario: ${cardData.scenario}`);
    }
    if (cardData.system_prompt) {
      parts.push(cardData.system_prompt);
    }

    // Retrieve relevant memories
    const memories = await memoryService.retrieveMemories({
      characterId,
      userId,
      query: userMessage,
      limit: 5,
    });

    if (memories.length > 0) {
      parts.push('\n## 关于用户的记忆');
      const memoryByType: Record<string, string[]> = {
        fact: [],
        preference: [],
        relationship: [],
        event: [],
      };

      for (const mem of memories) {
        memoryByType[mem.type]?.push(mem.content);
      }

      if (memoryByType.fact.length > 0) {
        parts.push(`【事实】${memoryByType.fact.join('；')}`);
      }
      if (memoryByType.preference.length > 0) {
        parts.push(`【偏好】${memoryByType.preference.join('；')}`);
      }
      if (memoryByType.relationship.length > 0) {
        parts.push(`【关系】${memoryByType.relationship.join('；')}`);
      }
      if (memoryByType.event.length > 0) {
        parts.push(`【事件】${memoryByType.event.join('；')}`);
      }
    }

    // Get current emotion
    const emotion = await emotionService.getCurrentEmotion(characterId, userId, chatId);
    if (emotion) {
      parts.push(`\n## 当前情感状态`);
      parts.push(`当前情感: ${emotion.label}, Valence: ${emotion.valence.toFixed(2)}, Arousal: ${emotion.arousal.toFixed(2)}`);
    }

    // Behavior guidelines
    parts.push('\n## 行为指引');
    parts.push('- 根据记忆中的信息个性化回复');
    parts.push('- 保持情感状态的一致性，情感变化应自然过渡');
    parts.push('- 可以主动提及相关记忆，但不要生硬');
    parts.push('Stay in character at all times.');

    return parts.join('\n');
  }

  // Message counter for batch extraction
  private messageCounters: Map<string, number> = new Map();

  async checkAndExtractMemories(
    chatId: string,
    characterId: string,
    userId: string,
    subscriptionTier = 'free'
  ): Promise<void> {
    const key = `${chatId}:${characterId}:${userId}`;
    const count = (this.messageCounters.get(key) ?? 0) + 1;
    this.messageCounters.set(key, count);

    // Extract every 10 messages
    if (count >= 10) {
      this.messageCounters.set(key, 0);

      // Get recent messages
      const messages = await this.getMessages(chatId, { limit: 10 });

      // Extract memories
      const extracted = await memoryService.extractMemories(characterId, userId, messages);

      // Store each memory
      for (const memory of extracted) {
        await memoryService.storeMemory(characterId, userId, memory, chatId, subscriptionTier);
      }
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/services/chat.service.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/services/chat.service.ts src/server/services/chat.service.spec.ts
git commit -m "feat(service): extend ChatService with memory and emotion integration"
```

---

### Task 11: Create Intelligence API Routes

**Files:**
- Create: `src/server/routes/intelligence.ts`
- Create: `src/server/routes/intelligence.spec.ts`

**Step 1: Write the failing test**

```typescript
// src/server/routes/intelligence.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { intelligenceRoutes } from './intelligence';

vi.mock('../services/memory.service', () => ({
  memoryService: {
    getMemories: vi.fn(),
    storeMemory: vi.fn(),
    deleteMemory: vi.fn(),
    clearAllMemories: vi.fn(),
    getMemoryCount: vi.fn(),
  },
}));

vi.mock('../services/emotion.service', () => ({
  emotionService: {
    getCurrentEmotion: vi.fn(),
    getEmotionHistory: vi.fn(),
    resetEmotion: vi.fn(),
  },
}));

import { memoryService } from '../services/memory.service';
import { emotionService } from '../services/emotion.service';

describe('Intelligence Routes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    // Mock auth middleware
    app.use('*', async (c, next) => {
      c.set('user', { id: 'user-1', tenantId: 'tenant-1' });
      await next();
    });
    app.route('/api/v1/characters', intelligenceRoutes);
  });

  describe('GET /:id/memories', () => {
    it('should return memories for character', async () => {
      vi.mocked(memoryService.getMemories).mockResolvedValue([
        { id: 'mem-1', content: 'User likes coffee', type: 'preference' },
      ] as any);
      vi.mocked(memoryService.getMemoryCount).mockResolvedValue(1);

      const res = await app.request('/api/v1/characters/char-1/memories');
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
    });
  });

  describe('GET /:id/emotion', () => {
    it('should return current emotion', async () => {
      vi.mocked(emotionService.getCurrentEmotion).mockResolvedValue({
        valence: 0.5,
        arousal: 0.4,
        label: 'happy',
        description: '当前情感: happy',
      });

      const res = await app.request('/api/v1/characters/char-1/emotion');
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.label).toBe('happy');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/routes/intelligence.spec.ts`
Expected: FAIL - module not found

**Step 3: Write the implementation**

```typescript
// src/server/routes/intelligence.ts
/**
 * Intelligence Routes
 *
 * API endpoints for character memory and emotion management
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { memoryService } from '../services/memory.service';
import { emotionService } from '../services/emotion.service';
import { authMiddleware } from '../middleware/auth';
import type { ApiResponse } from '../../types/api';

export const intelligenceRoutes = new Hono();

// Validation schemas
const createMemorySchema = z.object({
  type: z.enum(['fact', 'preference', 'relationship', 'event']),
  content: z.string().min(1).max(1000),
  importance: z.number().min(0).max(1).optional().default(0.5),
});

const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
});

// GET /:id/memories - List memories
intelligenceRoutes.get(
  '/:id/memories',
  authMiddleware(),
  zValidator('query', paginationSchema),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('id');
    const { limit, offset } = c.req.valid('query');

    const memories = await memoryService.getMemories(characterId, user.id, limit);
    const total = await memoryService.getMemoryCount(characterId, user.id);

    return c.json<ApiResponse>({
      success: true,
      data: memories.slice(offset, offset + limit),
      meta: {
        timestamp: new Date().toISOString(),
        total,
        limit,
        offset,
      },
    });
  }
);

// POST /:id/memories - Add memory manually
intelligenceRoutes.post(
  '/:id/memories',
  authMiddleware(),
  zValidator('json', createMemorySchema),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('id');
    const input = c.req.valid('json');

    await memoryService.storeMemory(characterId, user.id, {
      type: input.type,
      content: input.content,
      importance: input.importance,
    });

    return c.json<ApiResponse>(
      {
        success: true,
        data: { message: 'Memory added successfully' },
        meta: { timestamp: new Date().toISOString() },
      },
      201
    );
  }
);

// DELETE /:id/memories/:memoryId - Delete single memory
intelligenceRoutes.delete('/:id/memories/:memoryId', authMiddleware(), async (c) => {
  const memoryId = c.req.param('memoryId');

  await memoryService.deleteMemory(memoryId);

  return c.json<ApiResponse>({
    success: true,
    data: { message: 'Memory deleted successfully' },
    meta: { timestamp: new Date().toISOString() },
  });
});

// DELETE /:id/memories - Clear all memories
intelligenceRoutes.delete('/:id/memories', authMiddleware(), async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('id');

  await memoryService.clearAllMemories(characterId, user.id);

  return c.json<ApiResponse>({
    success: true,
    data: { message: 'All memories cleared' },
    meta: { timestamp: new Date().toISOString() },
  });
});

// GET /:id/emotion - Get current emotion
intelligenceRoutes.get('/:id/emotion', authMiddleware(), async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('id');
  const chatId = c.req.query('chatId');

  const emotion = await emotionService.getCurrentEmotion(characterId, user.id, chatId);

  if (!emotion) {
    return c.json<ApiResponse>({
      success: true,
      data: {
        valence: 0,
        arousal: 0.3,
        label: 'calm',
        description: '当前情感: calm (默认)',
      },
      meta: { timestamp: new Date().toISOString() },
    });
  }

  return c.json<ApiResponse>({
    success: true,
    data: emotion,
    meta: { timestamp: new Date().toISOString() },
  });
});

// GET /:id/emotions/history - Get emotion history
intelligenceRoutes.get(
  '/:id/emotions/history',
  authMiddleware(),
  zValidator('query', paginationSchema),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('id');
    const { limit } = c.req.valid('query');

    const history = await emotionService.getEmotionHistory(characterId, user.id, limit);

    return c.json<ApiResponse>({
      success: true,
      data: history,
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

// POST /:id/emotion/reset - Reset emotion
intelligenceRoutes.post('/:id/emotion/reset', authMiddleware(), async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('id');

  await emotionService.resetEmotion(characterId, user.id);

  return c.json<ApiResponse>({
    success: true,
    data: { message: 'Emotion reset to default' },
    meta: { timestamp: new Date().toISOString() },
  });
});

// GET /:id/intelligence/stats - Get usage statistics
intelligenceRoutes.get('/:id/intelligence/stats', authMiddleware(), async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('id');

  const memoryCount = await memoryService.getMemoryCount(characterId, user.id);
  const emotion = await emotionService.getCurrentEmotion(characterId, user.id);

  return c.json<ApiResponse>({
    success: true,
    data: {
      memoryCount,
      currentEmotion: emotion?.label ?? 'calm',
    },
    meta: { timestamp: new Date().toISOString() },
  });
});
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/routes/intelligence.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/routes/intelligence.ts src/server/routes/intelligence.spec.ts
git commit -m "feat(api): add intelligence routes for memory and emotion management"
```

---

### Task 12: Register Intelligence Routes

**Files:**
- Modify: `src/server/index.ts`

**Step 1: Import and register routes**

Add to `src/server/index.ts`:

```typescript
import { intelligenceRoutes } from './routes/intelligence';

// After existing character routes registration
app.route('/api/v1/characters', intelligenceRoutes);
```

**Step 2: Verify server starts**

Run: `npm run dev`
Expected: Server starts without errors

**Step 3: Test endpoint manually**

Run: `curl http://localhost:3000/api/v1/characters/test-id/emotion -H "Authorization: Bearer $TOKEN"`
Expected: Returns emotion data or 401 if not authenticated

**Step 4: Commit**

```bash
git add src/server/index.ts
git commit -m "feat(server): register intelligence routes"
```

---

## Phase 3: Frontend Integration

### Task 13: Create Character Intelligence Store

**Files:**
- Create: `src/client/stores/characterIntelligence.ts`

**Step 1: Create the store**

```typescript
// src/client/stores/characterIntelligence.ts
/**
 * Character Intelligence Store
 *
 * Manages memory and emotion state for characters
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { apiClient } from '@client/services/api';

export interface Memory {
  id: string;
  type: 'fact' | 'preference' | 'relationship' | 'event';
  content: string;
  importance: number;
  createdAt: string;
  lastAccessed: string;
}

export interface EmotionState {
  valence: number;
  arousal: number;
  label: string;
  description: string;
}

export interface MemoryInput {
  type: 'fact' | 'preference' | 'relationship' | 'event';
  content: string;
  importance?: number;
}

export const useCharacterIntelligenceStore = defineStore('characterIntelligence', () => {
  // State
  const memories = ref<Memory[]>([]);
  const currentEmotion = ref<EmotionState | null>(null);
  const emotionHistory = ref<EmotionState[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const memoryTotal = ref(0);

  // Computed
  const memoriesByType = computed(() => ({
    facts: memories.value.filter((m) => m.type === 'fact'),
    preferences: memories.value.filter((m) => m.type === 'preference'),
    relationships: memories.value.filter((m) => m.type === 'relationship'),
    events: memories.value.filter((m) => m.type === 'event'),
  }));

  const memoryCount = computed(() => memories.value.length);

  // Actions
  async function fetchMemories(characterId: string, limit = 100): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const response = await apiClient.get(`/characters/${characterId}/memories`, {
        params: { limit },
      });
      memories.value = response.data.data;
      memoryTotal.value = response.data.meta?.total ?? memories.value.length;
    } catch (err) {
      error.value = 'Failed to fetch memories';
      console.error(err);
    } finally {
      loading.value = false;
    }
  }

  async function addMemory(characterId: string, memory: MemoryInput): Promise<boolean> {
    loading.value = true;
    error.value = null;

    try {
      await apiClient.post(`/characters/${characterId}/memories`, memory);
      await fetchMemories(characterId);
      return true;
    } catch (err) {
      error.value = 'Failed to add memory';
      console.error(err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function deleteMemory(characterId: string, memoryId: string): Promise<boolean> {
    loading.value = true;
    error.value = null;

    try {
      await apiClient.delete(`/characters/${characterId}/memories/${memoryId}`);
      memories.value = memories.value.filter((m) => m.id !== memoryId);
      memoryTotal.value--;
      return true;
    } catch (err) {
      error.value = 'Failed to delete memory';
      console.error(err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function clearAllMemories(characterId: string): Promise<boolean> {
    loading.value = true;
    error.value = null;

    try {
      await apiClient.delete(`/characters/${characterId}/memories`);
      memories.value = [];
      memoryTotal.value = 0;
      return true;
    } catch (err) {
      error.value = 'Failed to clear memories';
      console.error(err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function fetchEmotion(characterId: string, chatId?: string): Promise<void> {
    try {
      const params = chatId ? { chatId } : {};
      const response = await apiClient.get(`/characters/${characterId}/emotion`, { params });
      currentEmotion.value = response.data.data;
    } catch (err) {
      console.error('Failed to fetch emotion:', err);
    }
  }

  async function fetchEmotionHistory(characterId: string, limit = 50): Promise<void> {
    try {
      const response = await apiClient.get(`/characters/${characterId}/emotions/history`, {
        params: { limit },
      });
      emotionHistory.value = response.data.data;
    } catch (err) {
      console.error('Failed to fetch emotion history:', err);
    }
  }

  async function resetEmotion(characterId: string): Promise<boolean> {
    try {
      await apiClient.post(`/characters/${characterId}/emotion/reset`);
      currentEmotion.value = {
        valence: 0,
        arousal: 0.3,
        label: 'calm',
        description: '当前情感: calm',
      };
      return true;
    } catch (err) {
      console.error('Failed to reset emotion:', err);
      return false;
    }
  }

  function $reset(): void {
    memories.value = [];
    currentEmotion.value = null;
    emotionHistory.value = [];
    loading.value = false;
    error.value = null;
    memoryTotal.value = 0;
  }

  return {
    // State
    memories,
    currentEmotion,
    emotionHistory,
    loading,
    error,
    memoryTotal,

    // Computed
    memoriesByType,
    memoryCount,

    // Actions
    fetchMemories,
    addMemory,
    deleteMemory,
    clearAllMemories,
    fetchEmotion,
    fetchEmotionHistory,
    resetEmotion,
    $reset,
  };
});
```

**Step 2: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/client/stores/characterIntelligence.ts
git commit -m "feat(store): add characterIntelligence store for memory and emotion"
```

---

### Task 14: Create EmotionIndicator Component

**Files:**
- Create: `src/client/components/EmotionIndicator.vue`

**Step 1: Create the component**

```vue
<!-- src/client/components/EmotionIndicator.vue -->
<template>
  <div class="emotion-indicator" :class="[`emotion-${emotion?.label ?? 'calm'}`]">
    <span class="emotion-icon">{{ emotionIcon }}</span>
    <span v-if="showLabel" class="emotion-label">{{ emotion?.label ?? 'calm' }}</span>
    <el-tooltip v-if="showTooltip" :content="tooltipContent" placement="bottom">
      <el-icon class="info-icon"><InfoFilled /></el-icon>
    </el-tooltip>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { InfoFilled } from '@element-plus/icons-vue';
import { useCharacterIntelligenceStore } from '@client/stores/characterIntelligence';
import { storeToRefs } from 'pinia';

interface Props {
  showLabel?: boolean;
  showTooltip?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showLabel: true,
  showTooltip: false,
});

const store = useCharacterIntelligenceStore();
const { currentEmotion: emotion } = storeToRefs(store);

const EMOTION_ICONS: Record<string, string> = {
  excited: '🤩',
  happy: '😊',
  loving: '🥰',
  calm: '😌',
  curious: '🤔',
  surprised: '😮',
  confused: '😕',
  bored: '😐',
  sad: '😢',
  fearful: '😨',
  angry: '😠',
  disgusted: '🤢',
};

const emotionIcon = computed(() => EMOTION_ICONS[emotion.value?.label ?? 'calm'] ?? '😌');

const tooltipContent = computed(() => {
  if (!emotion.value) return '情感状态未知';
  return `Valence: ${emotion.value.valence.toFixed(2)}, Arousal: ${emotion.value.arousal.toFixed(2)}`;
});
</script>

<style scoped>
.emotion-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 16px;
  background: var(--el-fill-color-light);
  font-size: 14px;
}

.emotion-icon {
  font-size: 18px;
}

.emotion-label {
  text-transform: capitalize;
  color: var(--el-text-color-regular);
}

.info-icon {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  cursor: help;
}

/* Emotion-specific colors */
.emotion-happy,
.emotion-excited,
.emotion-loving {
  background: rgba(103, 194, 58, 0.1);
}

.emotion-sad,
.emotion-fearful {
  background: rgba(64, 158, 255, 0.1);
}

.emotion-angry,
.emotion-disgusted {
  background: rgba(245, 108, 108, 0.1);
}

.emotion-curious,
.emotion-surprised {
  background: rgba(230, 162, 60, 0.1);
}
</style>
```

**Step 2: Verify component compiles**

Run: `npx vue-tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/client/components/EmotionIndicator.vue
git commit -m "feat(component): add EmotionIndicator for displaying emotion state"
```

---

### Task 15: Create MemoryPanel Component

**Files:**
- Create: `src/client/components/MemoryPanel.vue`

**Step 1: Create the component**

```vue
<!-- src/client/components/MemoryPanel.vue -->
<template>
  <div class="memory-panel">
    <div class="panel-header">
      <h3>角色记忆</h3>
      <div class="header-actions">
        <el-button size="small" @click="showAddDialog = true">
          <el-icon><Plus /></el-icon>
          添加
        </el-button>
        <el-popconfirm
          title="确定要清空所有记忆吗？"
          confirm-button-text="确定"
          cancel-button-text="取消"
          @confirm="handleClearAll"
        >
          <template #reference>
            <el-button size="small" type="danger" :disabled="memories.length === 0">
              清空
            </el-button>
          </template>
        </el-popconfirm>
      </div>
    </div>

    <div class="memory-stats">
      <span>共 {{ memoryTotal }} 条记忆</span>
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="全部" name="all">
        <MemoryList :memories="memories" @delete="handleDelete" />
      </el-tab-pane>
      <el-tab-pane :label="`事实 (${memoriesByType.facts.length})`" name="fact">
        <MemoryList :memories="memoriesByType.facts" @delete="handleDelete" />
      </el-tab-pane>
      <el-tab-pane :label="`偏好 (${memoriesByType.preferences.length})`" name="preference">
        <MemoryList :memories="memoriesByType.preferences" @delete="handleDelete" />
      </el-tab-pane>
      <el-tab-pane :label="`关系 (${memoriesByType.relationships.length})`" name="relationship">
        <MemoryList :memories="memoriesByType.relationships" @delete="handleDelete" />
      </el-tab-pane>
      <el-tab-pane :label="`事件 (${memoriesByType.events.length})`" name="event">
        <MemoryList :memories="memoriesByType.events" @delete="handleDelete" />
      </el-tab-pane>
    </el-tabs>

    <!-- Add Memory Dialog -->
    <el-dialog v-model="showAddDialog" title="添加记忆" width="400px">
      <el-form :model="newMemory" label-width="80px">
        <el-form-item label="类型">
          <el-select v-model="newMemory.type" placeholder="选择类型">
            <el-option label="事实" value="fact" />
            <el-option label="偏好" value="preference" />
            <el-option label="关系" value="relationship" />
            <el-option label="事件" value="event" />
          </el-select>
        </el-form-item>
        <el-form-item label="内容">
          <el-input
            v-model="newMemory.content"
            type="textarea"
            :rows="3"
            placeholder="输入记忆内容"
          />
        </el-form-item>
        <el-form-item label="重要性">
          <el-slider v-model="newMemory.importance" :min="0" :max="1" :step="0.1" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="handleAdd">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { useCharacterIntelligenceStore } from '@client/stores/characterIntelligence';
import { storeToRefs } from 'pinia';
import { useToast } from '@client/composables/useToast';
import MemoryList from './MemoryList.vue';

interface Props {
  characterId: string;
}

const props = defineProps<Props>();

const store = useCharacterIntelligenceStore();
const { memories, memoriesByType, memoryTotal, loading } = storeToRefs(store);
const { showSuccess, showError } = useToast();

const activeTab = ref('all');
const showAddDialog = ref(false);
const newMemory = reactive({
  type: 'fact' as const,
  content: '',
  importance: 0.5,
});

onMounted(() => {
  store.fetchMemories(props.characterId);
});

async function handleAdd(): Promise<void> {
  if (!newMemory.content.trim()) {
    showError('请输入记忆内容');
    return;
  }

  const success = await store.addMemory(props.characterId, {
    type: newMemory.type,
    content: newMemory.content,
    importance: newMemory.importance,
  });

  if (success) {
    showSuccess('记忆添加成功');
    showAddDialog.value = false;
    newMemory.content = '';
    newMemory.importance = 0.5;
  } else {
    showError('添加失败');
  }
}

async function handleDelete(memoryId: string): Promise<void> {
  const success = await store.deleteMemory(props.characterId, memoryId);
  if (success) {
    showSuccess('记忆已删除');
  } else {
    showError('删除失败');
  }
}

async function handleClearAll(): Promise<void> {
  const success = await store.clearAllMemories(props.characterId);
  if (success) {
    showSuccess('所有记忆已清空');
  } else {
    showError('清空失败');
  }
}
</script>

<style scoped>
.memory-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.panel-header h3 {
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.memory-stats {
  color: var(--el-text-color-secondary);
  font-size: 14px;
  margin-bottom: 12px;
}
</style>
```

**Step 2: Create MemoryList sub-component**

```vue
<!-- src/client/components/MemoryList.vue -->
<template>
  <div class="memory-list">
    <div v-if="memories.length === 0" class="empty-state">
      <el-empty description="暂无记忆" />
    </div>
    <div v-else class="memory-items">
      <div v-for="memory in memories" :key="memory.id" class="memory-item">
        <div class="memory-content">
          <el-tag size="small" :type="getTagType(memory.type)">
            {{ getTypeLabel(memory.type) }}
          </el-tag>
          <span class="content-text">{{ memory.content }}</span>
        </div>
        <div class="memory-meta">
          <span class="importance">重要性: {{ (memory.importance * 100).toFixed(0) }}%</span>
          <el-button
            size="small"
            type="danger"
            text
            @click="$emit('delete', memory.id)"
          >
            删除
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Memory } from '@client/stores/characterIntelligence';

interface Props {
  memories: Memory[];
}

defineProps<Props>();
defineEmits<{
  delete: [memoryId: string];
}>();

function getTagType(type: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const types: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    fact: 'info',
    preference: 'success',
    relationship: 'warning',
    event: '',
  };
  return types[type] ?? '';
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    fact: '事实',
    preference: '偏好',
    relationship: '关系',
    event: '事件',
  };
  return labels[type] ?? type;
}
</script>

<style scoped>
.memory-list {
  max-height: 400px;
  overflow-y: auto;
}

.memory-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.memory-item {
  padding: 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
}

.memory-content {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}

.content-text {
  flex: 1;
  line-height: 1.5;
}

.memory-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.empty-state {
  padding: 40px 0;
}
</style>
```

**Step 3: Verify components compile**

Run: `npx vue-tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/client/components/MemoryPanel.vue src/client/components/MemoryList.vue
git commit -m "feat(component): add MemoryPanel and MemoryList for memory management"
```

---

### Task 16: Integrate into Chat Page

**Files:**
- Modify: `src/client/pages/Chat.vue`

**Step 1: Add imports and state**

Add to `<script setup>` section:

```typescript
import { useCharacterIntelligenceStore } from '@client/stores/characterIntelligence';
import EmotionIndicator from '@client/components/EmotionIndicator.vue';
import MemoryPanel from '@client/components/MemoryPanel.vue';

const intelligenceStore = useCharacterIntelligenceStore();
const showMemoryPanel = ref(false);

// Fetch emotion when character changes
watch(
  () => chatStore.currentCharacter?.id,
  async (characterId) => {
    if (characterId) {
      await intelligenceStore.fetchEmotion(characterId, chatStore.currentChatId ?? undefined);
    }
  },
  { immediate: true }
);
```

**Step 2: Add UI elements to template**

Add to chat header section:

```vue
<div class="character-info">
  <h2>{{ currentCharacter?.name }}</h2>
  <EmotionIndicator v-if="currentCharacter" show-label />
</div>
<el-button
  v-if="currentCharacter"
  text
  @click="showMemoryPanel = true"
>
  <el-icon><Document /></el-icon>
  记忆 ({{ intelligenceStore.memoryCount }})
</el-button>
```

Add drawer at end of template:

```vue
<el-drawer
  v-model="showMemoryPanel"
  title="角色记忆"
  direction="rtl"
  size="400px"
>
  <MemoryPanel
    v-if="currentCharacter"
    :character-id="currentCharacter.id"
  />
</el-drawer>
```

**Step 3: Verify page compiles**

Run: `npx vue-tsc --noEmit`
Expected: No errors

**Step 4: Test manually**

Run: `npm run dev:client`
Expected: Chat page shows emotion indicator and memory button

**Step 5: Commit**

```bash
git add src/client/pages/Chat.vue
git commit -m "feat(page): integrate emotion indicator and memory panel into Chat"
```

---

## Phase 4: Testing and Optimization

### Task 17: Add E2E Tests for Intelligence Features

**Files:**
- Create: `e2e/intelligence.spec.ts`

**Step 1: Create E2E test file**

```typescript
// e2e/intelligence.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Character Intelligence', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should display emotion indicator in chat', async ({ page }) => {
    // Navigate to chat with a character
    await page.goto('/chat');
    await page.click('.character-select'); // Open character selector
    await page.click('.character-option:first-child'); // Select first character

    // Check emotion indicator is visible
    const emotionIndicator = page.locator('.emotion-indicator');
    await expect(emotionIndicator).toBeVisible();
    await expect(emotionIndicator).toContainText(/calm|happy|curious/i);
  });

  test('should open memory panel', async ({ page }) => {
    await page.goto('/chat');
    await page.click('.character-select');
    await page.click('.character-option:first-child');

    // Click memory button
    await page.click('button:has-text("记忆")');

    // Check drawer opens
    const drawer = page.locator('.el-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('角色记忆');
  });

  test('should add and delete memory', async ({ page }) => {
    await page.goto('/chat');
    await page.click('.character-select');
    await page.click('.character-option:first-child');
    await page.click('button:has-text("记忆")');

    // Add memory
    await page.click('button:has-text("添加")');
    await page.selectOption('select', 'fact');
    await page.fill('textarea', 'Test memory content');
    await page.click('button:has-text("添加"):visible');

    // Verify memory appears
    await expect(page.locator('.memory-item')).toContainText('Test memory content');

    // Delete memory
    await page.click('.memory-item button:has-text("删除")');
    await expect(page.locator('.memory-item')).not.toBeVisible();
  });
});
```

**Step 2: Run E2E tests**

Run: `npx playwright test e2e/intelligence.spec.ts`
Expected: Tests pass (may need test user setup)

**Step 3: Commit**

```bash
git add e2e/intelligence.spec.ts
git commit -m "test(e2e): add E2E tests for intelligence features"
```

---

### Task 18: Add Integration Tests

**Files:**
- Create: `src/server/services/intelligence.integration.spec.ts`

**Step 1: Create integration test**

```typescript
// src/server/services/intelligence.integration.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db';
import { characterMemories, characterMemoryVectors } from '../../db/schema/memories';
import { characterEmotions } from '../../db/schema/emotions';
import { MemoryService } from './memory.service';
import { EmotionService } from './emotion.service';
import { EmbeddingService } from './embedding.service';
import { eq } from 'drizzle-orm';

describe('Intelligence Integration Tests', () => {
  const testCharacterId = 'test-char-integration';
  const testUserId = 'test-user-integration';

  let memoryService: MemoryService;
  let emotionService: EmotionService;
  let embeddingService: EmbeddingService;

  beforeAll(async () => {
    embeddingService = new EmbeddingService();
    await embeddingService.initialize();
    memoryService = new MemoryService();
    emotionService = new EmotionService();
  });

  afterAll(async () => {
    // Cleanup test data
    await db.delete(characterMemories).where(eq(characterMemories.characterId, testCharacterId));
    await db.delete(characterEmotions).where(eq(characterEmotions.characterId, testCharacterId));
  });

  describe('Memory Flow', () => {
    it('should store and retrieve memory with vector search', async () => {
      // Store a memory
      await memoryService.storeMemory(testCharacterId, testUserId, {
        type: 'fact',
        content: 'User is a software engineer who loves TypeScript',
        importance: 0.8,
      });

      // Retrieve with similar query
      const results = await memoryService.retrieveMemories({
        characterId: testCharacterId,
        userId: testUserId,
        query: 'What is the user\'s profession?',
        limit: 5,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('software engineer');
    });
  });

  describe('Emotion Flow', () => {
    it('should analyze and update emotion', async () => {
      const result = await emotionService.analyzeAndUpdate({
        characterId: testCharacterId,
        userId: testUserId,
        chatId: 'test-chat',
        text: 'I am so excited about this new feature!',
      });

      expect(result.valence).toBeGreaterThan(0);
      expect(result.label).toBeDefined();

      // Verify persistence
      const stored = await emotionService.getCurrentEmotion(
        testCharacterId,
        testUserId,
        'test-chat'
      );
      expect(stored).not.toBeNull();
      expect(stored?.label).toBe(result.label);
    });

    it('should smooth emotion transitions', async () => {
      // First emotion
      await emotionService.analyzeAndUpdate({
        characterId: testCharacterId,
        userId: testUserId,
        chatId: 'test-chat-2',
        text: 'I am very happy!',
      });

      // Second emotion (should be smoothed)
      const result = await emotionService.analyzeAndUpdate({
        characterId: testCharacterId,
        userId: testUserId,
        chatId: 'test-chat-2',
        text: 'I am extremely angry!',
      });

      // Should not jump directly to angry due to smoothing
      expect(result.valence).toBeGreaterThan(-0.8);
    });
  });
});
```

**Step 2: Run integration tests**

Run: `npx vitest run src/server/services/intelligence.integration.spec.ts`
Expected: Tests pass

**Step 3: Commit**

```bash
git add src/server/services/intelligence.integration.spec.ts
git commit -m "test(integration): add integration tests for memory and emotion services"
```

---

### Task 19: Performance Optimization

**Files:**
- Modify: `src/server/services/embedding.service.ts`
- Modify: `src/server/services/memory.service.ts`

**Step 1: Add embedding cache**

Add to `embedding.service.ts`:

```typescript
import { cacheService } from './cache.service';

// In EmbeddingService class
private readonly CACHE_TTL = 3600; // 1 hour

async embed(text: string): Promise<number[]> {
  // Check cache first
  const cacheKey = `embedding:${this.hashText(text)}`;
  const cached = await cacheService.get<number[]>(cacheKey);
  if (cached) {
    return cached;
  }

  if (!this.embeddingPipeline) {
    await this.initialize();
  }

  const output = await this.embeddingPipeline!(text, {
    pooling: 'mean',
    normalize: true,
  });

  const embedding = Array.from(output.data as Float32Array);

  // Cache the result
  await cacheService.set(cacheKey, embedding, this.CACHE_TTL);

  return embedding;
}

private hashText(text: string): string {
  // Simple hash for cache key
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}
```

**Step 2: Add batch embedding support**

Add to `embedding.service.ts`:

```typescript
async embedBatch(texts: string[]): Promise<number[][]> {
  // Process in parallel with concurrency limit
  const results: number[][] = [];
  const batchSize = 10;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embeddings = await Promise.all(batch.map(t => this.embed(t)));
    results.push(...embeddings);
  }

  return results;
}
```

**Step 3: Add memory retrieval caching**

Add to `memory.service.ts`:

```typescript
import { cacheService } from './cache.service';

// In retrieveMemories method, add caching
async retrieveMemories(query: MemoryQuery): Promise<ScoredMemory[]> {
  const { characterId, userId, query: queryText, limit = 10 } = query;

  // Check cache
  const cacheKey = `memories:${characterId}:${userId}:${this.hashQuery(queryText)}`;
  const cached = await cacheService.get<ScoredMemory[]>(cacheKey);
  if (cached) {
    return cached;
  }

  // ... existing retrieval logic ...

  // Cache results for 5 minutes
  await cacheService.set(cacheKey, result, 300);

  return result;
}

private hashQuery(query: string): string {
  return query.toLowerCase().trim().substring(0, 50).replace(/\s+/g, '-');
}
```

**Step 4: Run performance test**

Run: `npx vitest run --reporter=verbose src/server/services/embedding.service.spec.ts`
Expected: Tests pass with improved performance

**Step 5: Commit**

```bash
git add src/server/services/embedding.service.ts src/server/services/memory.service.ts
git commit -m "perf: add caching for embeddings and memory retrieval"
```

---

## Summary

### Tasks Overview

| Phase | Task | Description |
|-------|------|-------------|
| 1 | 1 | Install pgvector extension |
| 1 | 2 | Create memories schema |
| 1 | 3 | Create emotions schema |
| 1 | 4 | Install @xenova/transformers |
| 1 | 5 | Create memory repository |
| 1 | 6 | Create emotion repository |
| 2 | 7 | Implement EmbeddingService |
| 2 | 8 | Implement MemoryService |
| 2 | 9 | Implement EmotionService |
| 2 | 10 | Extend ChatService |
| 2 | 11 | Create intelligence routes |
| 2 | 12 | Register routes |
| 3 | 13 | Create intelligence store |
| 3 | 14 | Create EmotionIndicator |
| 3 | 15 | Create MemoryPanel |
| 3 | 16 | Integrate into Chat page |
| 4 | 17 | Add E2E tests |
| 4 | 18 | Add integration tests |
| 4 | 19 | Performance optimization |

### Dependencies

```
Task 1 ──┬── Task 2 ──┬── Task 5 ──┬── Task 8 ──┬── Task 10 ──┬── Task 11 ──┬── Task 12
         │            │            │            │             │
         └── Task 3 ──┴── Task 6 ──┴── Task 9 ──┘             │
                                                              │
Task 4 ──────────────────── Task 7 ───────────────────────────┘
                                                              │
                                                              ▼
                                              Task 13 ──┬── Task 14 ──┬── Task 16
                                                        │             │
                                                        └── Task 15 ──┘
                                                                      │
                                                                      ▼
                                                        Task 17 ── Task 18 ── Task 19
```

### Estimated Commits

19 commits total, one per task.

### Final Verification

After completing all tasks:

```bash
# Run all tests
npm run test

# Run E2E tests
npx playwright test

# Verify build
npm run build

# Check TypeScript
npx tsc --noEmit
npx vue-tsc --noEmit
```
