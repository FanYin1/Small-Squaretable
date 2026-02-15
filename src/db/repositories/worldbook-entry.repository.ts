/**
 * World Book Entry Repository
 *
 * Handles data access for world book entries.
 */

import { eq } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { worldbookEntries } from '../schema/worldbooks';

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
}

export const worldBookEntryRepository = new WorldBookEntryRepository(db);
