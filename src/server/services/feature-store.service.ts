/**
 * Feature Store Service
 *
 * Reads user profiles, character stats, and trending data from Redis Feature Store.
 * Data is written by Flink jobs; this service is read-only from the Node.js side.
 */

import { getRedisClient } from '../../core/redis';

export class FeatureStoreService {
  async getUserProfile(userId: string): Promise<Record<string, string>> {
    const client = await getRedisClient();
    return client.hGetAll(`fs:user:${userId}:profile`);
  }

  async getUserInterests(userId: string, limit = 20): Promise<Array<{ tag: string; score: number }>> {
    const client = await getRedisClient();
    const results = await client.zRangeWithScores(`fs:user:${userId}:interests`, 0, limit - 1, { REV: true });
    return results.map((r: { value: string; score: number }) => ({ tag: r.value, score: r.score }));
  }

  async getUserRecent(userId: string, limit = 20): Promise<string[]> {
    const client = await getRedisClient();
    return client.lRange(`fs:user:${userId}:recent`, 0, limit - 1);
  }

  async getCharacterStats(characterId: string): Promise<Record<string, string>> {
    const client = await getRedisClient();
    return client.hGetAll(`fs:char:${characterId}:stats`);
  }

  async getTrending(limit = 20): Promise<Array<{ characterId: string; score: number }>> {
    const client = await getRedisClient();
    const results = await client.zRangeWithScores('fs:global:trending', 0, limit - 1, { REV: true });
    return results.map((r: { value: string; score: number }) => ({ characterId: r.value, score: r.score }));
  }

  async getPopularByGenre(genre: string, limit = 20): Promise<Array<{ characterId: string; score: number }>> {
    const client = await getRedisClient();
    const results = await client.zRangeWithScores(`fs:global:popular:${genre}`, 0, limit - 1, { REV: true });
    return results.map((r: { value: string; score: number }) => ({ characterId: r.value, score: r.score }));
  }
}

export const featureStoreService = new FeatureStoreService();
