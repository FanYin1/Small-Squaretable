/**
 * Activity Repository
 *
 * 处理活动动态的数据访问（创建活动、获取关注者动态流、用户活动列表）
 */

import { eq, desc, sql } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { activities } from '../schema/activities';
import type { Activity, NewActivity } from '../schema/activities';

export class ActivityRepository extends BaseRepository {
  /**
   * Create an activity record.
   */
  async create(data: NewActivity): Promise<Activity> {
    const [activity] = await this.db.insert(activities).values(data).returning();
    return activity;
  }

  /**
   * Get the activity feed for a user — activities from users they follow.
   * Uses a raw SQL join against the follows table.
   */
  async getFeed(userId: string, limit = 20, offset = 0): Promise<Activity[]> {
    const rows = await this.db.execute(sql`
      SELECT a.*
      FROM activities a
      INNER JOIN follows f ON f.following_id = a.user_id
      WHERE f.follower_id = ${userId}::uuid
      ORDER BY a.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);
    return rows as unknown as Activity[];
  }

  /**
   * Get activities for a specific user (their own activity history).
   */
  async getByUser(userId: string, limit = 20, offset = 0): Promise<Activity[]> {
    return await this.db
      .select()
      .from(activities)
      .where(eq(activities.userId, userId))
      .orderBy(desc(activities.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Delete all activities for a user (e.g. GDPR account deletion).
   */
  async deleteByUser(userId: string): Promise<void> {
    await this.db.delete(activities).where(eq(activities.userId, userId));
  }
}

export const activityRepository = new ActivityRepository(db);
