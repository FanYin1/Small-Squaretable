/**
 * RatingRepository 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../index';
import { ratings } from '../schema/ratings';
import { characters } from '../schema/characters';
import { users } from '../schema/users';
import { tenants } from '../schema/tenants';
import { RatingRepository } from './rating.repository';
import { eq } from 'drizzle-orm';

describe('RatingRepository', () => {
  let repository: RatingRepository;
  let testTenantId: string;
  let testUserId: string;
  let testCharacterId: string;

  beforeEach(async () => {
    repository = new RatingRepository(db);

    // Create test tenant
    const [tenant] = await db.insert(tenants).values({
      name: 'Test Tenant',
      slug: 'test-tenant-' + Date.now(),
    }).returning();
    testTenantId = tenant.id;

    // Create test user
    const [user] = await db.insert(users).values({
      tenantId: testTenantId,
      email: `test-${Date.now()}@example.com`,
      passwordHash: 'hash',
      username: `testuser-${Date.now()}`,
    }).returning();
    testUserId = user.id;

    // Create test character
    const [character] = await db.insert(characters).values({
      tenantId: testTenantId,
      creatorId: testUserId,
      name: 'Test Character',
      cardData: { name: 'Test' },
      isPublic: true,
    }).returning();
    testCharacterId = character.id;
  });

  afterEach(async () => {
    // Clean up in reverse order of dependencies
    await db.delete(ratings).where(eq(ratings.characterId, testCharacterId));
    await db.delete(characters).where(eq(characters.id, testCharacterId));
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  });

  describe('create', () => {
    it('should create a new rating', async () => {
      const ratingData = {
        characterId: testCharacterId,
        userId: testUserId,
        quality: 5,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 5,
      };

      const rating = await repository.create(ratingData);

      expect(rating).toBeDefined();
      expect(rating.id).toBeDefined();
      expect(rating.characterId).toBe(testCharacterId);
      expect(rating.userId).toBe(testUserId);
      expect(rating.quality).toBe(5);
      expect(rating.creativity).toBe(4);
      expect(rating.interactivity).toBe(4);
      expect(rating.accuracy).toBe(4);
      expect(rating.entertainment).toBe(5);
    });

    it('should enforce UNIQUE constraint on character_id and user_id', async () => {
      const ratingData = {
        characterId: testCharacterId,
        userId: testUserId,
        quality: 5,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 5,
      };

      await repository.create(ratingData);

      // Attempt to create duplicate rating should fail
      await expect(repository.create(ratingData)).rejects.toThrow();
    });
  });

  describe('findByCharacterAndUser', () => {
    it('should find rating by character and user', async () => {
      const ratingData = {
        characterId: testCharacterId,
        userId: testUserId,
        quality: 5,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 5,
      };

      await repository.create(ratingData);

      const found = await repository.findByCharacterAndUser(testCharacterId, testUserId);

      expect(found).toBeDefined();
      expect(found?.characterId).toBe(testCharacterId);
      expect(found?.userId).toBe(testUserId);
    });

    it('should return null if rating not found', async () => {
      const found = await repository.findByCharacterAndUser(testCharacterId, testUserId);
      expect(found).toBeNull();
    });
  });

  describe('findByCharacterId', () => {
    it('should find all ratings for a character', async () => {
      // Create first rating
      await repository.create({
        characterId: testCharacterId,
        userId: testUserId,
        quality: 5,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 5,
      });

      // Create second user and rating
      const [user2] = await db.insert(users).values({
        tenantId: testTenantId,
        email: `test2-${Date.now()}@example.com`,
        passwordHash: 'hash',
        username: `testuser2-${Date.now()}`,
      }).returning();

      await repository.create({
        characterId: testCharacterId,
        userId: user2.id,
        quality: 3,
        creativity: 3,
        interactivity: 3,
        accuracy: 3,
        entertainment: 3,
      });

      const allRatings = await repository.findByCharacterId(testCharacterId);

      expect(allRatings).toHaveLength(2);
      expect(allRatings.some(r => r.userId === testUserId)).toBe(true);
      expect(allRatings.some(r => r.userId === user2.id)).toBe(true);

      // Cleanup
      await db.delete(users).where(eq(users.id, user2.id));
    });
  });

  describe('upsert', () => {
    it('should insert new rating if not exists', async () => {
      const ratingData = {
        characterId: testCharacterId,
        userId: testUserId,
        quality: 5,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 5,
      };

      const rating = await repository.upsert(ratingData);

      expect(rating).toBeDefined();
      expect(rating.quality).toBe(5);
    });

    it('should update existing rating if exists', async () => {
      const ratingData = {
        characterId: testCharacterId,
        userId: testUserId,
        quality: 5,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 5,
      };

      await repository.create(ratingData);

      const updatedData = {
        ...ratingData,
        quality: 3,
        creativity: 3,
      };

      const updated = await repository.upsert(updatedData);

      expect(updated.quality).toBe(3);
      expect(updated.creativity).toBe(3);
      expect(updated.interactivity).toBe(4);
    });
  });

  describe('delete', () => {
    it('should delete rating by character and user', async () => {
      await repository.create({
        characterId: testCharacterId,
        userId: testUserId,
        quality: 5,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 5,
      });

      const deleted = await repository.delete(testCharacterId, testUserId);

      expect(deleted).toBe(true);

      const found = await repository.findByCharacterAndUser(testCharacterId, testUserId);
      expect(found).toBeNull();
    });

    it('should return false if rating not found', async () => {
      const deleted = await repository.delete(testCharacterId, testUserId);
      expect(deleted).toBe(false);
    });
  });

  describe('getAverageRatings', () => {
    it('should calculate average ratings for a character', async () => {
      // Create first rating
      await repository.create({
        characterId: testCharacterId,
        userId: testUserId,
        quality: 5,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 5,
      });

      // Create second user and rating
      const [user2] = await db.insert(users).values({
        tenantId: testTenantId,
        email: `test2-${Date.now()}@example.com`,
        passwordHash: 'hash',
        username: `testuser2-${Date.now()}`,
      }).returning();

      await repository.create({
        characterId: testCharacterId,
        userId: user2.id,
        quality: 3,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 3,
      });

      const averages = await repository.getAverageRatings(testCharacterId);

      expect(averages).toBeDefined();
      expect(averages.quality).toBe('4.00'); // (5+3)/2
      expect(averages.creativity).toBe('4.00'); // (4+4)/2
      expect(averages.interactivity).toBe('4.00'); // (4+4)/2
      expect(averages.accuracy).toBe('4.00'); // (4+4)/2
      expect(averages.entertainment).toBe('4.00'); // (5+3)/2
      expect(averages.count).toBe(2);

      // Cleanup
      await db.delete(users).where(eq(users.id, user2.id));
    });

    it('should return null values if no ratings exist', async () => {
      const averages = await repository.getAverageRatings(testCharacterId);

      expect(averages).toBeDefined();
      expect(averages.quality).toBeNull();
      expect(averages.creativity).toBeNull();
      expect(averages.interactivity).toBeNull();
      expect(averages.accuracy).toBeNull();
      expect(averages.entertainment).toBeNull();
      expect(averages.count).toBe(0);
    });
  });
});
