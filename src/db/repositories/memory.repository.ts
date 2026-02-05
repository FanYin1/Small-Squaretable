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
