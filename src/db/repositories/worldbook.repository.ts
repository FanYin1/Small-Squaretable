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
}

export const worldBookRepository = new WorldBookRepository(db);
