/**
 * Memory Repository
 *
 * Data access layer for character memories and vectors
 */

import { eq, and, asc, desc, inArray, isNull, sql } from 'drizzle-orm';
import { db, type Database } from '../index';
import { characterMemories, characterMemoryVectors } from '../schema/memories';
import type { CharacterMemory, NewCharacterMemory, NewCharacterMemoryVector } from '../schema/memories';
import { config } from '../../core/config';

export interface MemoryWithScore extends CharacterMemory {
  score: number;
  similarity?: number;
  decayedImportance?: number;
  recency?: number;
}

export interface HybridSearchParams {
  characterId: string;
  userId: string;
  embedding: number[];
  chatId?: string | null;
  limit?: number;
}

export class MemoryRepository {
  constructor(private readonly database: Database = db) {}
  async create(data: NewCharacterMemory): Promise<CharacterMemory> {
    return this.database.transaction(async transaction => {
      const scope = `${data.characterId}:${data.userId}:${data.sourceChatId ?? 'global'}`;
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`);
      const [existing] = await transaction.select().from(characterMemories).where(and(
        eq(characterMemories.characterId, data.characterId), eq(characterMemories.userId, data.userId),
        eq(characterMemories.content, data.content),
        data.sourceChatId ? eq(characterMemories.sourceChatId, data.sourceChatId) : isNull(characterMemories.sourceChatId),
      )).limit(1);
      if (existing) return existing;
      const [memory] = await transaction.insert(characterMemories).values(data).returning();
      return memory;
    });
  }

  async createVector(data: NewCharacterMemoryVector): Promise<void> {
    await this.database.insert(characterMemoryVectors).values(data);
  }

  async findByCharacterAndUser(
    characterId: string,
    userId: string,
    limit = 100,
    chatId?: string | null
  ): Promise<CharacterMemory[]> {
    const conditions = [
      eq(characterMemories.characterId, characterId),
      eq(characterMemories.userId, userId),
    ];

    if (chatId) {
      conditions.push(eq(characterMemories.sourceChatId, chatId));
    }
    if (chatId === null) conditions.push(isNull(characterMemories.sourceChatId));

    return await this.database
      .select()
      .from(characterMemories)
      .where(and(...conditions))
      .orderBy(desc(characterMemories.lastAccessed))
      .limit(limit);
  }

  async hybridSearch(params: HybridSearchParams): Promise<MemoryWithScore[]> {
    const { characterId, userId, embedding, chatId, limit = 10 } = params;
    const embeddingStr = `[${embedding.join(',')}]`;

    const wSim = config.memorySimilarityWeight;
    const wImp = config.memoryImportanceWeight;
    const wRec = config.memoryRecencyWeight;
    const halfLifeSec = config.memoryDecayHalfLifeDays * 86400;

    const chatFilter = chatId
      ? sql`AND m.source_chat_id = ${chatId}::uuid`
      : chatId === null ? sql`AND m.source_chat_id IS NULL` : sql``;

    const result = await this.database.execute(sql`
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

  async findStoryPreferences(characterId: string, userId: string, chatId: string): Promise<CharacterMemory[]> {
    return this.database.select().from(characterMemories).where(and(
      eq(characterMemories.characterId, characterId), eq(characterMemories.userId, userId),
      eq(characterMemories.sourceChatId, chatId), eq(characterMemories.type, 'preference'),
    )).orderBy(desc(characterMemories.createdAt), desc(characterMemories.id)).limit(20);
  }

  async updateAccessTimeBatch(memoryIds: string[]): Promise<void> {
    if (memoryIds.length === 0) return;
    await this.database
      .update(characterMemories)
      .set({
        lastAccessed: new Date(),
        accessCount: sql`${characterMemories.accessCount} + 1`,
      })
      .where(inArray(characterMemories.id, memoryIds));
  }

  async updateAccessTime(memoryId: string): Promise<void> {
    await this.database
      .update(characterMemories)
      .set({
        lastAccessed: new Date(),
        accessCount: sql`${characterMemories.accessCount} + 1`,
      })
      .where(eq(characterMemories.id, memoryId));
  }

  async delete(memoryId: string): Promise<void> {
    await this.database.delete(characterMemories).where(eq(characterMemories.id, memoryId));
  }

  async deleteAllForCharacterUser(characterId: string, userId: string, chatId?: string | null): Promise<void> {
    const conditions = [
      eq(characterMemories.characterId, characterId),
      eq(characterMemories.userId, userId),
    ];

    if (chatId) {
      conditions.push(eq(characterMemories.sourceChatId, chatId));
    }

    if (chatId === null) conditions.push(isNull(characterMemories.sourceChatId));

    await this.database
      .delete(characterMemories)
      .where(and(...conditions));
  }

  async countByCharacterUser(characterId: string, userId: string, chatId?: string | null): Promise<number> {
    const conditions = [
      eq(characterMemories.characterId, characterId),
      eq(characterMemories.userId, userId),
    ];

    if (chatId) {
      conditions.push(eq(characterMemories.sourceChatId, chatId));
    }

    const result = await this.database
      .select({ count: sql<number>`count(*)` })
      .from(characterMemories)
      .where(and(...conditions, chatId === null ? isNull(characterMemories.sourceChatId) : undefined));
    return Number(result[0]?.count ?? 0);
  }

  async findSimilar(
    characterId: string,
    userId: string,
    embedding: number[],
    threshold = 0.85,
    limit = 5,
    chatId?: string | null
  ): Promise<Array<CharacterMemory & { similarity: number }>> {
    const embeddingStr = `[${embedding.join(',')}]`;

    const result = await this.database.execute(sql`
      SELECT m.*, (1 - (v.embedding <=> ${embeddingStr}::vector)) as similarity
      FROM character_memories m
      JOIN character_memory_vectors v ON v.memory_id = m.id
      WHERE m.character_id = ${characterId}::uuid
        AND m.user_id = ${userId}::uuid
        ${chatId === undefined ? sql`` : chatId === null ? sql`AND m.source_chat_id IS NULL` : sql`AND m.source_chat_id = ${chatId}::uuid`}
        AND (1 - (v.embedding <=> ${embeddingStr}::vector)) >= ${threshold}
      ORDER BY similarity DESC
      LIMIT ${limit}
    `);

    return result as unknown as Array<CharacterMemory & { similarity: number }>;
  }

  async updateContent(memoryId: string, content: string, importance: string): Promise<void> {
    await this.database
      .update(characterMemories)
      .set({ content, importance, lastAccessed: new Date() })
      .where(eq(characterMemories.id, memoryId));
  }

  async updateVector(memoryId: string, embedding: number[]): Promise<void> {
    const embeddingStr = `[${embedding.join(',')}]`;
    await this.database.execute(sql`
      UPDATE character_memory_vectors
      SET embedding = ${embeddingStr}::vector
      WHERE memory_id = ${memoryId}::uuid
    `);
  }

  async findPromotionCandidates(
    characterId: string,
    userId: string,
    minImportance = 0.7,
    minAccessCount = 2
  ): Promise<CharacterMemory[]> {
    return await this.database
      .select()
      .from(characterMemories)
      .where(
        and(
          eq(characterMemories.characterId, characterId),
          eq(characterMemories.userId, userId),
          sql`${characterMemories.sourceChatId} IS NOT NULL`,
          sql`EXISTS (SELECT 1 FROM chats WHERE chats.id = ${characterMemories.sourceChatId} AND chats.content_snapshot_version IS NULL)`,
          sql`CAST(${characterMemories.importance} AS NUMERIC) >= ${minImportance}`,
          sql`${characterMemories.accessCount} >= ${minAccessCount}`,
        )
      )
      .orderBy(desc(characterMemories.importance))
      .limit(50);
  }

  async promoteToGlobal(memoryId: string): Promise<void> {
    await this.database
      .update(characterMemories)
      .set({ sourceChatId: null })
      .where(and(eq(characterMemories.id, memoryId), sql`EXISTS (SELECT 1 FROM chats WHERE chats.id = ${characterMemories.sourceChatId} AND chats.content_snapshot_version IS NULL)`));
  }

  async deleteOldest(characterId: string, userId: string, count: number, chatId?: string | null): Promise<number> {
    // Select the oldest memories by lastAccessed (ascending)
    const oldest = await this.database
      .select({ id: characterMemories.id })
      .from(characterMemories)
      .where(
        and(
          eq(characterMemories.characterId, characterId),
          eq(characterMemories.userId, userId),
          chatId === undefined ? undefined : chatId === null ? isNull(characterMemories.sourceChatId) : eq(characterMemories.sourceChatId, chatId),
        )
      )
      .orderBy(asc(characterMemories.lastAccessed))
      .limit(count);

    if (oldest.length === 0) return 0;

    const ids = oldest.map((m) => m.id);
    await this.database.delete(characterMemories).where(inArray(characterMemories.id, ids));

    return ids.length;
  }
  async findActiveCharacterUserPairs(
    minMemoryCount = 10
  ): Promise<Array<{ characterId: string; userId: string }>> {
    const result = await this.database
      .select({
        characterId: characterMemories.characterId,
        userId: characterMemories.userId,
      })
      .from(characterMemories)
      .where(isNull(characterMemories.sourceChatId))
      .groupBy(characterMemories.characterId, characterMemories.userId)
      .having(sql`count(*) >= ${minMemoryCount}`);

    return result;
  }
}

export const memoryRepository = new MemoryRepository();
