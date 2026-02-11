/**
 * Moderation Repository
 *
 * Data access layer for moderation action logs.
 */

import { eq, and, desc } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { moderationActions, type ModerationAction, type NewModerationAction } from '../schema/moderation-actions';

export class ModerationRepository extends BaseRepository {
  async create(data: NewModerationAction): Promise<ModerationAction> {
    const result = await this.db.insert(moderationActions).values(data).returning();
    return result[0];
  }

  async findByTarget(targetType: string, targetId: string): Promise<ModerationAction[]> {
    return await this.db
      .select()
      .from(moderationActions)
      .where(
        and(
          eq(moderationActions.targetType, targetType),
          eq(moderationActions.targetId, targetId),
        )
      )
      .orderBy(desc(moderationActions.createdAt));
  }
}

export const moderationRepository = new ModerationRepository(db);
