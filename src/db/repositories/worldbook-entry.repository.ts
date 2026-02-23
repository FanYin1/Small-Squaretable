/**
 * World Book Entry Repository
 *
 * Handles data access for world book entries.
 */

import { eq, sql, or } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { worldbookEntries, worldbooks } from '../schema/worldbooks';

export class WorldBookEntryRepository extends BaseRepository {
  /**
   * Create a new world book entry.
   */
  async create(data: {
    worldBookId: string;
    keys: string[];
    keysSecondary?: string[];
    selectiveLogic?: string;
    content: string;
    comment?: string | null;
    position?: string;
    depth?: number;
    order?: number;
    enabled?: boolean;
    constant?: boolean;
    probability?: number;
    sticky?: number;
    cooldown?: number;
    delay?: number;
    caseSensitive?: boolean;
    matchWholeWords?: boolean;
    preventRecursion?: boolean;
    excludeRecursion?: boolean;
  }) {
    const [row] = await this.db
      .insert(worldbookEntries)
      .values({
        worldbookId: data.worldBookId,
        keyword: data.keys.join(','),
        content: data.content,
        position: data.order ?? 0,
        isEnabled: data.enabled ?? true,
        priority: data.depth ?? 0,
        settings: {
          keys: data.keys,
          keysSecondary: data.keysSecondary,
          selectiveLogic: data.selectiveLogic,
          comment: data.comment,
          position: data.position,
          depth: data.depth,
          order: data.order,
          constant: data.constant,
          probability: data.probability,
          sticky: data.sticky,
          cooldown: data.cooldown,
          delay: data.delay,
          caseSensitive: data.caseSensitive,
          matchWholeWords: data.matchWholeWords,
          preventRecursion: data.preventRecursion,
          excludeRecursion: data.excludeRecursion,
        },
      })
      .returning();
    return row;
  }

  /**
   * Find all entries for a world book, ordered by position.
   */
  async findByWorldBook(worldbookId: string) {
    return this.db.select().from(worldbookEntries)
      .where(eq(worldbookEntries.worldbookId, worldbookId))
      .orderBy(worldbookEntries.position);
  }

  /**
   * Find a single entry by ID.
   */
  async findById(id: string) {
    const [row] = await this.db.select().from(worldbookEntries).where(eq(worldbookEntries.id, id));
    return row ?? null;
  }

  /**
   * Update an entry by ID.
   */
  async update(id: string, data: {
    keyword?: string;
    content?: string;
    position?: number;
    isEnabled?: boolean;
    priority?: number;
    settings?: Record<string, unknown>;
  }) {
    const updateData = { ...data, updatedAt: new Date() };
    const [row] = await this.db.update(worldbookEntries).set(updateData)
      .where(eq(worldbookEntries.id, id)).returning();
    return row ?? null;
  }

  /**
   * Delete an entry by ID.
   */
  async delete(id: string) {
    await this.db.delete(worldbookEntries).where(eq(worldbookEntries.id, id));
  }

  /**
   * Count entries in a world book.
   */
  async countByWorldBook(worldbookId: string): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)::int` })
      .from(worldbookEntries)
      .where(eq(worldbookEntries.worldbookId, worldbookId));
    return result[0]?.count ?? 0;
  }

  /**
   * Search worldbook entries belonging to a user by keyword/content ILIKE.
   */
  async searchByUser(
    userId: string,
    query: string,
    limit = 20,
  ): Promise<Array<{ id: string; keyword: string; content: string; worldbookId: string; worldbookName: string }>> {
    const escaped = query.replace(/[%_\\]/g, '\\$&');
    const pattern = `%${escaped}%`;

    const rows = await this.db
      .select({
        id: worldbookEntries.id,
        keyword: worldbookEntries.keyword,
        content: worldbookEntries.content,
        worldbookId: worldbookEntries.worldbookId,
        worldbookName: worldbooks.name,
      })
      .from(worldbookEntries)
      .innerJoin(worldbooks, eq(worldbookEntries.worldbookId, worldbooks.id))
      .where(
        sql`${worldbooks.userId} = ${userId} AND (${worldbookEntries.keyword} ILIKE ${pattern} OR ${worldbookEntries.content} ILIKE ${pattern})`,
      )
      .limit(limit);

    return rows;
  }
}

export const worldBookEntryRepository = new WorldBookEntryRepository(db);
