/**
 * Experiment Service
 *
 * Deterministic A/B test variant assignment using MD5 hashing.
 * Caches assignments in Redis for fast lookups.
 */

import { createHash } from 'crypto';
import { getRedisClient } from '../../core/redis';
import { experimentRepository } from '../../db/repositories/experiment.repository';
import type { Experiment } from '../../db/schema/experiments';

const CACHE_TTL = 3600; // 1 hour

export class ExperimentService {
  /**
   * Deterministic variant assignment via MD5 hash.
   * Same userId + experiment name always returns the same variant.
   */
  assignVariant(userId: string, experiment: Experiment): string {
    const hash = createHash('md5').update(userId + ':' + experiment.name).digest();
    const value = hash.readUInt32BE(0);
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    const target = value % totalWeight;

    let cumulative = 0;
    for (const variant of experiment.variants) {
      cumulative += variant.weight;
      if (target < cumulative) {
        return variant.name;
      }
    }

    // Fallback to last variant (should not happen with valid weights)
    return experiment.variants[experiment.variants.length - 1].name;
  }

  /**
   * Get variant config for a user in a named experiment.
   * Checks Redis cache first, then assigns deterministically.
   * Returns null if experiment doesn't exist or isn't running.
   */
  async getVariantConfig(
    userId: string,
    experimentName: string,
  ): Promise<{ variant: string; [key: string]: unknown } | null> {
    const redis = await getRedisClient();
    const cacheKey = `exp:${experimentName}:${userId}`;

    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Find experiment
    const experiment = await experimentRepository.findByName(experimentName);
    if (!experiment || experiment.status !== 'running') {
      return null;
    }

    // Assign variant
    const variantName = this.assignVariant(userId, experiment);
    const variantDef = experiment.variants.find((v) => v.name === variantName);
    const config = variantDef?.config ?? {};

    const result = { variant: variantName, ...config };

    // Cache for 1 hour
    await redis.set(cacheKey, JSON.stringify(result), { EX: CACHE_TTL });

    return result;
  }

  /**
   * Get all active (running) experiments.
   */
  async getActiveExperiments(): Promise<Experiment[]> {
    return experimentRepository.findActive();
  }
}

export const experimentService = new ExperimentService();
