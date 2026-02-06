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
  chatId?: string;  // Optional: filter by chat session
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
    limit = 100,
    chatId?: string
  ): Promise<CharacterMemory[]> {
    const conditions = [
      eq(characterMemories.characterId, characterId),
      eq(characterMemories.userId, userId),
    ];

    if (chatId) {
      conditions.push(eq(characterMemories.sourceChatId, chatId));
    }

    return await db
      .select()
      .from(characterMemories)
      .where(and(...conditions))
      .orderBy(desc(characterMemories.lastAccessed))
      .limit(limit);
  }

  async hybridSearch(params: HybridSearchParams): Promise<MemoryWithScore[]> {
    const { characterId, userId, embedding, chatId, limit = 10 } = params;
    const embeddingStr = `[${embedding.join(',')}]`;

    // Hybrid scoring: 0.5 * similarity + 0.3 * importance + 0.2 * recency
    // If chatId is provided, filter by source_chat_id for session isolation
    const chatFilter = chatId
      ? sql`AND m.source_chat_id = ${chatId}::uuid`
      : sql``;

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
        ${chatFilter}
      ORDER BY score DESC
      LIMIT ${limit}
    `);

    return result as unknown as MemoryWithScore[];
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

  async deleteAllForCharacterUser(characterId: string, userId: string, chatId?: string): Promise<void> {
    const conditions = [
      eq(characterMemories.characterId, characterId),
      eq(characterMemories.userId, userId),
    ];

    if (chatId) {
      conditions.push(eq(characterMemories.sourceChatId, chatId));
    }

    await db
      .delete(characterMemories)
      .where(and(...conditions));
  }

  async countByCharacterUser(characterId: string, userId: string, chatId?: string): Promise<number> {
    const conditions = [
      eq(characterMemories.characterId, characterId),
      eq(characterMemories.userId, userId),
    ];

    if (chatId) {
      conditions.push(eq(characterMemories.sourceChatId, chatId));
    }

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(characterMemories)
      .where(and(...conditions));
    return Number(result[0]?.count ?? 0);
  }
}

export const memoryRepository = new MemoryRepository();
