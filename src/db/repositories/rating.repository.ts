/**
 * 评分 Repository
 *
 * 处理评分数据的 CRUD 操作和聚合计算
 */

import { eq, and, avg, count, sql } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { ratings, type Rating, type NewRating } from '../schema/ratings';

export interface RatingAverages {
  quality: string | null;
  creativity: string | null;
  interactivity: string | null;
  accuracy: string | null;
  entertainment: string | null;
  count: number;
}

export class RatingRepository extends BaseRepository {
  async create(data: NewRating): Promise<Rating> {
    const result = await this.db.insert(ratings).values(data).returning();
    return result[0];
  }

  async findByCharacterAndUser(characterId: string, userId: string): Promise<Rating | null> {
    const result = await this.db
      .select()
      .from(ratings)
      .where(and(eq(ratings.characterId, characterId), eq(ratings.userId, userId)));
    return result[0] ?? null;
  }

  async findByCharacterId(characterId: string): Promise<Rating[]> {
    return await this.db
      .select()
      .from(ratings)
      .where(eq(ratings.characterId, characterId));
  }

  async upsert(data: NewRating): Promise<Rating> {
    const result = await this.db
      .insert(ratings)
      .values(data)
      .onConflictDoUpdate({
        target: [ratings.characterId, ratings.userId],
        set: {
          quality: data.quality,
          creativity: data.creativity,
          interactivity: data.interactivity,
          accuracy: data.accuracy,
          entertainment: data.entertainment,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0];
  }

  async delete(characterId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(ratings)
      .where(and(eq(ratings.characterId, characterId), eq(ratings.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async getAverageRatings(characterId: string): Promise<RatingAverages> {
    const result = await this.db
      .select({
        quality: sql<string | null>`ROUND(AVG(${ratings.quality})::numeric, 2)::text`,
        creativity: sql<string | null>`ROUND(AVG(${ratings.creativity})::numeric, 2)::text`,
        interactivity: sql<string | null>`ROUND(AVG(${ratings.interactivity})::numeric, 2)::text`,
        accuracy: sql<string | null>`ROUND(AVG(${ratings.accuracy})::numeric, 2)::text`,
        entertainment: sql<string | null>`ROUND(AVG(${ratings.entertainment})::numeric, 2)::text`,
        count: count(),
      })
      .from(ratings)
      .where(eq(ratings.characterId, characterId));

    return result[0] ?? {
      quality: null,
      creativity: null,
      interactivity: null,
      accuracy: null,
      entertainment: null,
      count: 0,
    };
  }
}

export const ratingRepository = new RatingRepository(db);
