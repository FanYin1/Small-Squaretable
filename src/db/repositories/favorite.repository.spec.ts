/**
 * FavoriteRepository unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../index';
import { favorites } from '../schema/social';
import { characters } from '../schema/characters';
import { users } from '../schema/users';
import { tenants } from '../schema/tenants';
import { FavoriteRepository } from './favorite.repository';
import { eq } from 'drizzle-orm';

describe('FavoriteRepository', () => {
  let repository: FavoriteRepository;
  let testTenantId: string;
  let testUserId: string;
  let testCharacterId: string;

  beforeEach(async () => {
    repository = new FavoriteRepository(db);

    // Create test tenant
    const [tenant] = await db.insert(tenants).values({
      name: 'Test Tenant',
    }).returning();
    testTenantId = tenant.id;

    // Create test user
    const [user] = await db.insert(users).values({
      tenantId: testTenantId,
      email: `test-fav-${Date.now()}@example.com`,
      passwordHash: 'hash',
    }).returning();
    testUserId = user.id;

    // Create test character
    const [character] = await db.insert(characters).values({
      tenantId: testTenantId,
      creatorId: testUserId,
      name: 'Test Character',
      description: 'A test character for favorites',
      avatarUrl: 'https://example.com/avatar.png',
      cardData: { name: 'Test Character' },
    }).returning();
    testCharacterId = character.id;
  });

  afterEach(async () => {
    // Clean up in reverse order of dependencies
    await db.delete(favorites);
    await db.delete(characters).where(eq(characters.creatorId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  });

  describe('favorite()', () => {
    it('should insert a favorite record and increment character favoriteCount', async () => {
      const result = await repository.favorite(testUserId, testCharacterId);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.userId).toBe(testUserId);
      expect(result.characterId).toBe(testCharacterId);
      expect(result.createdAt).toBeDefined();

      // Verify favoriteCount was incremented
      const count = await repository.getFavoriteCount(testCharacterId);
      expect(count).toBe(1);
    });

    it('should be idempotent on duplicate favorite', async () => {
      const first = await repository.favorite(testUserId, testCharacterId);
      const second = await repository.favorite(testUserId, testCharacterId);

      // Should return the same record
      expect(second.id).toBe(first.id);
      expect(second.userId).toBe(testUserId);
      expect(second.characterId).toBe(testCharacterId);

      // favoriteCount should still be 1 (not incremented twice)
      const count = await repository.getFavoriteCount(testCharacterId);
      expect(count).toBe(1);
    });
  });

  describe('unfavorite()', () => {
    it('should delete the favorite record and decrement character favoriteCount', async () => {
      // First, favorite
      await repository.favorite(testUserId, testCharacterId);
      const countBefore = await repository.getFavoriteCount(testCharacterId);
      expect(countBefore).toBe(1);

      // Then, unfavorite
      const result = await repository.unfavorite(testUserId, testCharacterId);
      expect(result).toBe(true);

      // Verify favoriteCount was decremented
      const countAfter = await repository.getFavoriteCount(testCharacterId);
      expect(countAfter).toBe(0);

      // Verify the favorite record is gone
      const isFav = await repository.isFavorited(testUserId, testCharacterId);
      expect(isFav).toBe(false);
    });

    it('should return false when favorite does not exist', async () => {
      const result = await repository.unfavorite(testUserId, testCharacterId);
      expect(result).toBe(false);
    });
  });

  describe('isFavorited()', () => {
    it('should return true when user has favorited the character', async () => {
      await repository.favorite(testUserId, testCharacterId);
      const result = await repository.isFavorited(testUserId, testCharacterId);
      expect(result).toBe(true);
    });

    it('should return false when user has not favorited the character', async () => {
      const result = await repository.isFavorited(testUserId, testCharacterId);
      expect(result).toBe(false);
    });
  });

  describe('getFavoritesByUser()', () => {
    it('should return paginated list with character info', async () => {
      // Create a second character
      const [char2] = await db.insert(characters).values({
        tenantId: testTenantId,
        creatorId: testUserId,
        name: 'Second Character',
        description: 'Another character',
        avatarUrl: 'https://example.com/avatar2.png',
        cardData: { name: 'Second Character' },
      }).returning();

      // Favorite both characters
      await repository.favorite(testUserId, testCharacterId);
      await repository.favorite(testUserId, char2.id);

      // Get first page (limit 1)
      const page1 = await repository.getFavoritesByUser(testUserId, 1, 0);
      expect(page1).toHaveLength(1);
      expect(page1[0].id).toBeDefined();
      expect(page1[0].name).toBeDefined();
      expect(page1[0].favoritedAt).toBeDefined();

      // Get all
      const all = await repository.getFavoritesByUser(testUserId, 10, 0);
      expect(all).toHaveLength(2);

      // Verify character info is present
      const names = all.map((f) => f.name).sort();
      expect(names).toEqual(['Second Character', 'Test Character']);
    });

    it('should return empty array when user has no favorites', async () => {
      const result = await repository.getFavoritesByUser(testUserId, 10, 0);
      expect(result).toHaveLength(0);
    });
  });

  describe('getFavoriteCount()', () => {
    it('should return the favorite count from the characters table', async () => {
      // Initially 0
      const count0 = await repository.getFavoriteCount(testCharacterId);
      expect(count0).toBe(0);

      // After favoriting
      await repository.favorite(testUserId, testCharacterId);
      const count1 = await repository.getFavoriteCount(testCharacterId);
      expect(count1).toBe(1);
    });

    it('should return 0 for non-existent character', async () => {
      const count = await repository.getFavoriteCount('00000000-0000-0000-0000-000000000000');
      expect(count).toBe(0);
    });
  });
});
