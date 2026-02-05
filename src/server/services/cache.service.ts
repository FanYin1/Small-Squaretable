/**
 * Cache Service
 *
 * Provides caching functionality with Redis for API responses
 */

import { redis } from '@/core/redis';
import { getRedisClient } from '@/core/redis';

export interface CacheOptions {
  /**
   * Cache TTL in seconds
   */
  ttl?: number;
  /**
   * Cache key prefix
   */
  prefix?: string;
}

export class CacheService {
  private readonly defaultPrefix = 'api';
  private readonly defaultTTL = 300; // 5 minutes

  /**
   * Generate cache key from parameters
   */
  private generateKey(prefix: string, ...parts: string[]): string {
    return `${this.defaultPrefix}:${prefix}:${parts.join(':')}`;
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await redis.get(key);
      if (!cached) return null;
      return JSON.parse(cached) as T;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set cached value
   */
  async set<T>(key: string, value: T, ttl: number = this.defaultTTL): Promise<void> {
    try {
      await redis.set(key, JSON.stringify(value), { EX: ttl });
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Delete cached value
   */
  async delete(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  async deletePattern(pattern: string): Promise<void> {
    try {
      const client = await getRedisClient();
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(keys);
      }
    } catch (error) {
      console.error('Cache delete pattern error:', error);
    }
  }

  /**
   * Get or set cache (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = this.defaultTTL
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetchFn();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Cache marketplace characters
   */
  async getCachedMarketplace<T>(page: number, limit: number): Promise<T | null> {
    const key = this.generateKey('marketplace', String(page), String(limit));
    return await this.get<T>(key);
  }

  async setCachedMarketplace<T>(page: number, limit: number, data: T): Promise<void> {
    const key = this.generateKey('marketplace', String(page), String(limit));
    await this.set(key, data, 300); // 5 minutes
  }

  async invalidateMarketplace(): Promise<void> {
    // Delete all marketplace cache keys
    await this.deletePattern(`${this.defaultPrefix}:marketplace:*`);
  }

  /**
   * Cache search results
   */
  async getCachedSearch<T>(
    query: string,
    sort?: string,
    category?: string,
    tags?: string[],
    page?: number,
    limit?: number
  ): Promise<T | null> {
    const key = this.generateSearchKey(query, sort, category, tags, page, limit);
    return await this.get<T>(key);
  }

  private generateSearchKey(
    query: string,
    sort?: string,
    category?: string,
    tags?: string[],
    page?: number,
    limit?: number
  ): string {
    const parts = [
      query,
      sort || 'relevance',
      category || 'all',
      tags?.join(',') || 'none',
      String(page || 1),
      String(limit || 20),
    ];
    return `${this.defaultPrefix}:search:${parts.join(':')}`;
  }

  async setCachedSearch<T>(
    query: string,
    sort: string | undefined,
    category: string | undefined,
    tags: string[] | undefined,
    page: number | undefined,
    limit: number | undefined,
    data: T
  ): Promise<void> {
    const key = this.generateSearchKey(query, sort, category, tags, page, limit);
    await this.set(key, data, 120); // 2 minutes
  }

  async invalidateSearch(): Promise<void> {
    await this.deletePattern(`${this.defaultPrefix}:search:*`);
  }

  /**
   * Cache character by ID
   */
  async getCachedCharacter<T>(characterId: string): Promise<T | null> {
    const key = this.generateKey('character', characterId);
    return await this.get<T>(key);
  }

  async setCachedCharacter<T>(characterId: string, data: T): Promise<void> {
    const key = this.generateKey('character', characterId);
    await this.set(key, data, 600); // 10 minutes
  }

  async invalidateCharacter(characterId: string): Promise<void> {
    const key = this.generateKey('character', characterId);
    await this.delete(key);
    // Also invalidate marketplace and search caches
    await this.invalidateMarketplace();
    await this.invalidateSearch();
  }

  /**
   * Clear all API cache
   */
  async clearAll(): Promise<void> {
    await this.deletePattern(`${this.defaultPrefix}:*`);
  }
}

export const cacheService = new CacheService();
