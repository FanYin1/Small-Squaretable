/**
 * API Key Repository
 *
 * Handles data access for API key CRUD operations and usage tracking.
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { apiKeys, type ApiKey, type NewApiKey } from '../schema/apiKeys';
import { db } from '../index';

export class ApiKeyRepository extends BaseRepository {
  /**
   * Create a new API key record.
   */
  async createApiKey(data: NewApiKey): Promise<ApiKey> {
    const [key] = await this.db.insert(apiKeys).values(data).returning();
    return key;
  }

  /**
   * Find an API key by its hash. Used for authentication lookups.
   */
  async findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    const [key] = await this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);
    return key || null;
  }

  /**
   * Find all API keys for a user with pagination, ordered by creation date descending.
   */
  async findByUserId(userId: string, limit: number, offset: number): Promise<ApiKey[]> {
    return this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Find a specific API key by id and userId (ownership check).
   */
  async findById(id: string, userId: string): Promise<ApiKey | null> {
    const [key] = await this.db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
      .limit(1);
    return key || null;
  }

  /**
   * Update an API key's mutable fields (name, scopes, rateLimitPerMinute, isActive).
   * Returns the updated record or null if not found.
   */
  async updateApiKey(
    id: string,
    userId: string,
    data: Partial<Pick<ApiKey, 'name' | 'scopes' | 'rateLimitPerMinute' | 'isActive'>>,
  ): Promise<ApiKey | null> {
    const [updated] = await this.db
      .update(apiKeys)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
      .returning();
    return updated || null;
  }

  /**
   * Delete an API key by id and userId.
   * Returns true if deleted, false if not found.
   */
  async deleteApiKey(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
      .returning({ id: apiKeys.id });
    return result.length > 0;
  }

  /**
   * Increment the request count and update lastUsedAt for a key (by hash).
   * Called on each authenticated API request.
   */
  async incrementRequestCount(keyHash: string): Promise<void> {
    await this.db
      .update(apiKeys)
      .set({
        requestCount: sql`${apiKeys.requestCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(apiKeys.keyHash, keyHash));
  }

  /**
   * Count total API keys for a user.
   */
  async countByUserId(userId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId));
    return result?.count || 0;
  }
}

export const apiKeyRepository = new ApiKeyRepository(db);
