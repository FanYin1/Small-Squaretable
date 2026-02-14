/**
 * Recommendation Service
 *
 * Provides trending, personalized, and similar character recommendations
 * by blending feature store data with content-based filtering.
 */

import { featureStoreService } from './feature-store.service';
import { characterRepository } from '../../db/repositories/character.repository';
import { getRedisClient } from '../../core/redis';
import { experimentService } from './experiment.service';

export interface RecommendationItem {
  characterId: string;
  score: number;
  source: 'trending' | 'collaborative' | 'content-based';
}

export interface PersonalizationWeights {
  trending: number;
  collaborative: number;
}

const DEFAULT_WEIGHTS: PersonalizationWeights = {
  trending: 0.4,
  collaborative: 0.6,
};

const CACHE_TTL = 900; // 15 minutes
const CACHE_PREFIX = 'rec:personalized:';

export class RecommendationService {
  /**
   * Get trending characters from the feature store.
   */
  async getTrending(limit = 20): Promise<RecommendationItem[]> {
    const trending = await featureStoreService.getTrending(limit);
    return trending.map((item) => ({
      characterId: item.characterId,
      score: item.score,
      source: 'trending' as const,
    }));
  }

  /**
   * Get personalized recommendations by blending trending + collaborative
   * (tag-based) strategies, filtering out recently viewed characters.
   * Results are cached in Redis with a 15-minute TTL.
   */
  async getPersonalized(
    userId: string,
    limit = 20,
    weights: PersonalizationWeights = DEFAULT_WEIGHTS,
  ): Promise<RecommendationItem[]> {
    // Check for A/B experiment override on weights
    let effectiveWeights = weights;
    let variantSuffix = '';

    const expConfig = await experimentService.getVariantConfig(userId, 'recommendation-weights');
    if (expConfig) {
      const expTrending = Number(expConfig.trending);
      const expCollaborative = Number(expConfig.collaborative);
      if (!isNaN(expTrending) && !isNaN(expCollaborative)) {
        effectiveWeights = { trending: expTrending, collaborative: expCollaborative };
        variantSuffix = `:${expConfig.variant}`;
      }
    }

    // Check cache first (include variant in key to avoid cross-variant collisions)
    const redis = await getRedisClient();
    const cacheKey = `${CACHE_PREFIX}${userId}${variantSuffix}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as RecommendationItem[];
    }

    // Fetch data in parallel
    const [trending, interests, recentIds] = await Promise.all([
      featureStoreService.getTrending(limit * 2),
      featureStoreService.getUserInterests(userId, 10),
      featureStoreService.getUserRecent(userId, 50),
    ]);

    const recentSet = new Set(recentIds);

    // Score map: characterId -> { score, source }
    const scoreMap = new Map<string, { score: number; source: RecommendationItem['source'] }>();

    // Add trending scores
    for (const item of trending) {
      if (recentSet.has(item.characterId)) continue;
      scoreMap.set(item.characterId, {
        score: item.score * effectiveWeights.trending,
        source: 'trending',
      });
    }

    // Collaborative: find characters matching user interest tags
    const tags = interests.map((i) => i.tag);
    if (tags.length > 0) {
      const tagMatches = await characterRepository.findPublicByTags(tags, limit * 2);
      for (const char of tagMatches) {
        if (recentSet.has(char.id)) continue;
        const existing = scoreMap.get(char.id);
        const collabScore = this.computeTagOverlap(char.tags ?? [], tags, interests) * effectiveWeights.collaborative;
        if (existing) {
          // Blend: keep higher source, sum scores
          scoreMap.set(char.id, {
            score: existing.score + collabScore,
            source: collabScore > existing.score ? 'collaborative' : existing.source,
          });
        } else {
          scoreMap.set(char.id, { score: collabScore, source: 'collaborative' });
        }
      }
    }

    // Sort by score descending, take top N
    const results: RecommendationItem[] = Array.from(scoreMap.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map(([characterId, { score, source }]) => ({ characterId, score, source }));

    // Cache results
    await redis.set(cacheKey, JSON.stringify(results), { EX: CACHE_TTL });

    return results;
  }

  /**
   * Get similar characters based on tag overlap.
   */
  async getSimilar(characterId: string, limit = 10): Promise<RecommendationItem[]> {
    const character = await characterRepository.findById(characterId);
    if (!character || !character.tags || character.tags.length === 0) {
      return [];
    }

    const matches = await characterRepository.findPublicByTags(character.tags, limit + 1);

    return matches
      .filter((c) => c.id !== characterId)
      .slice(0, limit)
      .map((c) => ({
        characterId: c.id,
        score: this.computeSimpleTagOverlap(c.tags ?? [], character.tags!),
        source: 'content-based' as const,
      }));
  }

  /** Compute weighted tag overlap score using interest weights. */
  private computeTagOverlap(
    charTags: string[],
    userTags: string[],
    interests: Array<{ tag: string; score: number }>,
  ): number {
    const interestMap = new Map(interests.map((i) => [i.tag, i.score]));
    let score = 0;
    for (const tag of charTags) {
      const weight = interestMap.get(tag);
      if (weight !== undefined) {
        score += weight;
      }
    }
    return score;
  }

  /** Compute simple Jaccard-like overlap score. */
  private computeSimpleTagOverlap(tagsA: string[], tagsB: string[]): number {
    const setB = new Set(tagsB);
    let overlap = 0;
    for (const tag of tagsA) {
      if (setB.has(tag)) overlap++;
    }
    const union = new Set([...tagsA, ...tagsB]).size;
    return union > 0 ? overlap / union : 0;
  }
}

export const recommendationService = new RecommendationService();
