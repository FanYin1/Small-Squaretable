/**
 * SearchService 单元测试
 *
 * 使用 TDD 方法：RED -> GREEN -> REFACTOR
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { searchService } from './search.service';
import { db } from '@/db';
import { characters } from '@/db/schema/characters';
import { tenants } from '@/db/schema/tenants';
import { users } from '@/db/schema/users';
import { sql } from 'drizzle-orm';

describe('SearchService', () => {
  let testTenantId: string;
  let testUserId: string;

  beforeAll(async () => {
    // 创建测试租户
    const tenantResult = await db
      .insert(tenants)
      .values({
        name: 'Test Tenant',
        plan: 'free',
      })
      .returning();
    testTenantId = tenantResult[0].id;

    // 创建测试用户
    const userResult = await db
      .insert(users)
      .values({
        tenantId: testTenantId,
        email: 'test@example.com',
        displayName: 'Test User',
      })
      .returning();
    testUserId = userResult[0].id;

    // 创建测试角色数据
    await db.insert(characters).values([
      {
        tenantId: testTenantId,
        creatorId: testUserId,
        name: 'Wizard Master',
        description: 'A powerful wizard with magical abilities',
        category: 'Fantasy',
        tags: ['wizard', 'magic', 'fantasy'],
        isPublic: true,
        isNsfw: false,
        cardData: { version: 1 },
        downloadCount: 100,
        viewCount: 500,
        ratingAvg: 4.5,
        ratingCount: 50,
      },
      {
        tenantId: testTenantId,
        creatorId: testUserId,
        name: 'Knight Hero',
        description: 'A brave knight on a heroic quest',
        category: 'Fantasy',
        tags: ['knight', 'hero', 'adventure'],
        isPublic: true,
        isNsfw: false,
        cardData: { version: 1 },
        downloadCount: 80,
        viewCount: 400,
        ratingAvg: 4.2,
        ratingCount: 40,
      },
      {
        tenantId: testTenantId,
        creatorId: testUserId,
        name: 'Sci-Fi Soldier',
        description: 'A futuristic soldier from the year 2500',
        category: 'Sci-Fi',
        tags: ['soldier', 'scifi', 'future'],
        isPublic: true,
        isNsfw: false,
        cardData: { version: 1 },
        downloadCount: 60,
        viewCount: 300,
        ratingAvg: 3.8,
        ratingCount: 30,
      },
      {
        tenantId: testTenantId,
        creatorId: testUserId,
        name: 'Private Character',
        description: 'A private character not visible to public',
        category: 'Fantasy',
        tags: ['private', 'secret'],
        isPublic: false,
        isNsfw: false,
        cardData: { version: 1 },
        downloadCount: 0,
        viewCount: 0,
        ratingAvg: null,
        ratingCount: 0,
      },
    ]);
  });

  afterAll(async () => {
    // 清理测试数据
    await db.delete(characters).where(sql`tenant_id = ${testTenantId}`);
    await db.delete(users).where(sql`id = ${testUserId}`);
    await db.delete(tenants).where(sql`id = ${testTenantId}`);
  });

  describe('searchCharacters', () => {
    it('should search by keyword with relevance ranking', async () => {
      const results = await searchService.searchCharacters({
        query: 'wizard',
        sort: 'relevance',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      expect(results.items.length).toBeGreaterThan(0);
      expect(results.items[0].name).toContain('Wizard');
      expect(results.pagination.total).toBeGreaterThan(0);
    });

    it('should filter by category', async () => {
      const results = await searchService.searchCharacters({
        query: 'fantasy',
        category: 'Fantasy',
        sort: 'relevance',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      expect(results.items.every((c) => c.category === 'Fantasy')).toBe(true);
    });

    it('should filter by tags', async () => {
      const results = await searchService.searchCharacters({
        query: 'hero',
        tags: ['hero'],
        sort: 'relevance',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      expect(results.items.length).toBeGreaterThan(0);
      expect(results.items.some((c) => c.tags?.includes('hero'))).toBe(true);
    });

    it('should sort by rating', async () => {
      const results = await searchService.searchCharacters({
        query: 'fantasy',
        sort: 'rating',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      // 验证排序：评分从高到低
      for (let i = 0; i < results.items.length - 1; i++) {
        const current = results.items[i].ratingAvg || 0;
        const next = results.items[i + 1].ratingAvg || 0;
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it('should sort by popular (download count)', async () => {
      const results = await searchService.searchCharacters({
        query: 'fantasy',
        sort: 'popular',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      // 验证排序：下载量从高到低
      for (let i = 0; i < results.items.length - 1; i++) {
        expect(results.items[i].downloadCount).toBeGreaterThanOrEqual(
          results.items[i + 1].downloadCount
        );
      }
    });

    it('should sort by newest', async () => {
      const results = await searchService.searchCharacters({
        query: 'fantasy',
        sort: 'newest',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      // 验证排序：创建时间从新到旧
      for (let i = 0; i < results.items.length - 1; i++) {
        expect(results.items[i].createdAt.getTime()).toBeGreaterThanOrEqual(
          results.items[i + 1].createdAt.getTime()
        );
      }
    });

    it('should filter public characters only', async () => {
      const results = await searchService.searchCharacters({
        query: 'character',
        sort: 'relevance',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      expect(results.items.every((c) => c.isPublic)).toBe(true);
    });

    it('should filter NSFW characters', async () => {
      const results = await searchService.searchCharacters({
        query: 'character',
        isNsfw: false,
        sort: 'relevance',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      expect(results.items.every((c) => !c.isNsfw)).toBe(true);
    });

    it('should support pagination', async () => {
      const page1 = await searchService.searchCharacters({
        query: 'fantasy',
        sort: 'relevance',
        filter: 'public',
        page: 1,
        limit: 2,
      });

      const page2 = await searchService.searchCharacters({
        query: 'fantasy',
        sort: 'relevance',
        filter: 'public',
        page: 2,
        limit: 2,
      });

      expect(page1.pagination.page).toBe(1);
      expect(page1.pagination.limit).toBe(2);
      expect(page2.pagination.page).toBe(2);

      // 验证不同页面的数据不重复
      const page1Ids = page1.items.map((c) => c.id);
      const page2Ids = page2.items.map((c) => c.id);
      expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
    });

    it('should return correct pagination info', async () => {
      const results = await searchService.searchCharacters({
        query: 'fantasy',
        sort: 'relevance',
        filter: 'public',
        page: 1,
        limit: 2,
      });

      expect(results.pagination.total).toBeGreaterThan(0);
      expect(results.pagination.totalPages).toBe(
        Math.ceil(results.pagination.total / 2)
      );
      expect(results.pagination.hasNext).toBe(results.pagination.total > 2);
      expect(results.pagination.hasPrev).toBe(false);
    });

    it('should return empty results for non-matching query', async () => {
      const results = await searchService.searchCharacters({
        query: 'nonexistentquery12345',
        sort: 'relevance',
        filter: 'public',
        page: 1,
        limit: 20,
      });

      expect(results.items.length).toBe(0);
      expect(results.pagination.total).toBe(0);
    });
  });
});
