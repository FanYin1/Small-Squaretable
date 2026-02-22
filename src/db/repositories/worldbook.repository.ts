/**
 * World Book Repository
 *
 * Handles data access for world books (lorebooks).
 */

import { eq } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { worldbooks } from '../schema/worldbooks';

export class WorldBookRepository extends BaseRepository {
  /**
   * Create a new world book.
   */
  async create(data: {
    name: string;
    scope: string;
    ownerId: string;
    characterId?: string;
    settings?: Record<string, unknown>;
  }) {
    const [row] = await this.db
      .insert(worldbooks)
      .values({
        tenantId: data.ownerId,
        userId: data.ownerId,
        characterId: data.characterId ?? null,
        name: data.name,
        scope: data.scope as 'global' | 'character' | 'persona' | 'chat',
      })
      .returning();
    return row;
  }

  /**
   * Find a world book by ID.
   */
  async findById(id: string) {
    const [row] = await this.db.select().from(worldbooks).where(eq(worldbooks.id, id));
    return row ?? null;
  }

  /**
   * Find all world books belonging to a user.
   */
  async findByUser(userId: string) {
    return this.db.select().from(worldbooks)
      .where(eq(worldbooks.userId, userId))
      .orderBy(worldbooks.createdAt);
  }

  /**
   * Find all world books associated with a character.
   */
  async findByCharacter(characterId: string) {
    return this.db.select().from(worldbooks)
      .where(eq(worldbooks.characterId, characterId))
      .orderBy(worldbooks.createdAt);
  }

  /**
   * Update a world book by ID.
   */
  async update(id: string, data: Partial<{ name: string; description: string | null; scope: string; isEnabled: boolean }>) {
    const updateData: Record<string, unknown> = { ...data, updatedAt: new Date() };
    if (data.scope) updateData.scope = data.scope as 'global' | 'character' | 'persona' | 'chat';
    const [row] = await this.db.update(worldbooks).set(updateData).where(eq(worldbooks.id, id)).returning();
    return row ?? null;
  }

  /**
   * Delete a world book by ID.
   */
  async delete(id: string) {
    await this.db.delete(worldbooks).where(eq(worldbooks.id, id));
  }
}

export const worldBookRepository = new WorldBookRepository(db);
