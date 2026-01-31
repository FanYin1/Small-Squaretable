/**
 * 评分服务
 *
 * 处理评分的业务逻辑，包括事务处理和聚合计算
 */

import { db } from '../../db/index';
import { ratingRepository, type RatingRepository } from '../../db/repositories/rating.repository';
import { characterRepository, type CharacterRepository } from '../../db/repositories/character.repository';
import { ratings } from '../../db/schema/ratings';
import { characters } from '../../db/schema/characters';
import { eq, sql, and } from 'drizzle-orm';
import { NotFoundError } from '../../core/errors';

export interface RatingInput {
  quality: number;
  creativity: number;
  interactivity: number;
  accuracy: number;
  entertainment: number;
}

export interface RatingDimensions {
  quality: string | null;
  creativity: string | null;
  interactivity: string | null;
  accuracy: string | null;
  entertainment: string | null;
}

export interface RatingResponse {
  overall: string | null;
  dimensions: RatingDimensions;
  count: number;
  userRating: RatingInput | null;
}

export class RatingService {
  constructor(
    private ratingRepo: RatingRepository = ratingRepository,
    private characterRepo: CharacterRepository = characterRepository
  ) {}

  /**
   * 提交评分（创建或更新）
   * 使用事务确保评分和聚合计算的原子性
   */
  async submitRating(
    characterId: string,
    userId: string,
    ratingData: RatingInput
  ): Promise<void> {
    await db.transaction(async (tx) => {
      // 1. 插入或更新评分记录
      await tx
        .insert(ratings)
        .values({
          characterId,
          userId,
          ...ratingData,
        })
        .onConflictDoUpdate({
          target: [ratings.characterId, ratings.userId],
          set: {
            quality: ratingData.quality,
            creativity: ratingData.creativity,
            interactivity: ratingData.interactivity,
            accuracy: ratingData.accuracy,
            entertainment: ratingData.entertainment,
            updatedAt: new Date(),
          },
        });

      // 2. 重新计算角色的平均评分（使用事务上下文）
      const [avgResult] = await tx
        .select({
          quality: sql<string | null>`ROUND(AVG(${ratings.quality})::numeric, 2)::text`,
          creativity: sql<string | null>`ROUND(AVG(${ratings.creativity})::numeric, 2)::text`,
          interactivity: sql<string | null>`ROUND(AVG(${ratings.interactivity})::numeric, 2)::text`,
          accuracy: sql<string | null>`ROUND(AVG(${ratings.accuracy})::numeric, 2)::text`,
          entertainment: sql<string | null>`ROUND(AVG(${ratings.entertainment})::numeric, 2)::text`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(ratings)
        .where(eq(ratings.characterId, characterId));

      const averages = avgResult || {
        quality: null,
        creativity: null,
        interactivity: null,
        accuracy: null,
        entertainment: null,
        count: 0,
      };

      // 3. 计算综合评分
      const overall = this.calculateOverall(averages);

      // 4. 更新角色表
      await tx
        .update(characters)
        .set({
          ratingQualityAvg: averages.quality,
          ratingCreativityAvg: averages.creativity,
          ratingInteractivityAvg: averages.interactivity,
          ratingAccuracyAvg: averages.accuracy,
          ratingEntertainmentAvg: averages.entertainment,
          ratingOverallAvg: overall,
          ratingCount: averages.count,
          updatedAt: new Date(),
        })
        .where(eq(characters.id, characterId));
    });
  }

  /**
   * 获取角色的评分详情
   */
  async getRatings(characterId: string, userId?: string): Promise<RatingResponse> {
    const averages = await this.ratingRepo.getAverageRatings(characterId);
    const overall = this.calculateOverall(averages);

    let userRating: RatingInput | null = null;
    if (userId) {
      const rating = await this.ratingRepo.findByCharacterAndUser(characterId, userId);
      if (rating) {
        userRating = {
          quality: rating.quality,
          creativity: rating.creativity,
          interactivity: rating.interactivity,
          accuracy: rating.accuracy,
          entertainment: rating.entertainment,
        };
      }
    }

    return {
      overall,
      dimensions: {
        quality: averages.quality,
        creativity: averages.creativity,
        interactivity: averages.interactivity,
        accuracy: averages.accuracy,
        entertainment: averages.entertainment,
      },
      count: averages.count,
      userRating,
    };
  }

  /**
   * 更新评分
   */
  async updateRating(
    characterId: string,
    userId: string,
    ratingData: RatingInput
  ): Promise<void> {
    // 检查评分是否存在
    const existing = await this.ratingRepo.findByCharacterAndUser(characterId, userId);
    if (!existing) {
      throw new NotFoundError('Rating not found');
    }

    // 使用 submitRating 来更新（它会处理事务）
    await this.submitRating(characterId, userId, ratingData);
  }

  /**
   * 删除评分
   */
  async deleteRating(characterId: string, userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // 1. 删除评分记录
      const result = await tx
        .delete(ratings)
        .where(and(eq(ratings.characterId, characterId), eq(ratings.userId, userId)))
        .returning();

      if (result.length === 0) {
        throw new NotFoundError('Rating not found');
      }

      // 2. 重新计算角色的平均评分（使用事务上下文）
      const [avgResult] = await tx
        .select({
          quality: sql<string | null>`ROUND(AVG(${ratings.quality})::numeric, 2)::text`,
          creativity: sql<string | null>`ROUND(AVG(${ratings.creativity})::numeric, 2)::text`,
          interactivity: sql<string | null>`ROUND(AVG(${ratings.interactivity})::numeric, 2)::text`,
          accuracy: sql<string | null>`ROUND(AVG(${ratings.accuracy})::numeric, 2)::text`,
          entertainment: sql<string | null>`ROUND(AVG(${ratings.entertainment})::numeric, 2)::text`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(ratings)
        .where(eq(ratings.characterId, characterId));

      const averages = avgResult || {
        quality: null,
        creativity: null,
        interactivity: null,
        accuracy: null,
        entertainment: null,
        count: 0,
      };

      // 3. 计算综合评分
      const overall = this.calculateOverall(averages);

      // 4. 更新角色表
      await tx
        .update(characters)
        .set({
          ratingQualityAvg: averages.quality,
          ratingCreativityAvg: averages.creativity,
          ratingInteractivityAvg: averages.interactivity,
          ratingAccuracyAvg: averages.accuracy,
          ratingEntertainmentAvg: averages.entertainment,
          ratingOverallAvg: overall,
          ratingCount: averages.count,
          updatedAt: new Date(),
        })
        .where(eq(characters.id, characterId));
    });
  }

  /**
   * 计算综合评分（五个维度的平均值）
   */
  private calculateOverall(averages: {
    quality: string | null;
    creativity: string | null;
    interactivity: string | null;
    accuracy: string | null;
    entertainment: string | null;
  }): string | null {
    if (!averages.quality) {
      return null;
    }

    const sum =
      parseFloat(averages.quality) +
      parseFloat(averages.creativity!) +
      parseFloat(averages.interactivity!) +
      parseFloat(averages.accuracy!) +
      parseFloat(averages.entertainment!);

    return (sum / 5).toFixed(2);
  }
}

export const ratingService = new RatingService();
