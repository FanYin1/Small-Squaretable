/**
 * RatingService 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../../db/index';
import { ratings } from '../../db/schema/ratings';
import { characters } from '../../db/schema/characters';
import { users } from '../../db/schema/users';
import { tenants } from '../../db/schema/tenants';
import { RatingService } from './rating.service';
import { eq } from 'drizzle-orm';

describe('RatingService', () => {
  let service: RatingService;
  let testTenantId: string;
  let testUserId: string;
  let testUser2Id: string;
  let testCharacterId: string;

  beforeEach(async () => {
    service = new RatingService();

    // Create test tenant
    const [tenant] = await db.insert(tenants).values({
      name: 'Test Tenant',
      slug: 'test-tenant-' + Date.now(),
    }).returning();
    testTenantId = tenant.id;

    // Create test users
    const [user] = await db.insert(users).values({
      tenantId: testTenantId,
      email: `test-${Date.now()}@example.com`,
      passwordHash: 'hash',
      username: `testuser-${Date.now()}`,
    }).returning();
    testUserId = user.id;

    const [user2] = await db.insert(users).values({
      tenantId: testTenantId,
      email: `test2-${Date.now()}@example.com`,
      passwordHash: 'hash',
      username: `testuser2-${Date.now()}`,
    }).returning();
    testUser2Id = user2.id;

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
    await db.delete(users).where(eq(users.id, testUser2Id));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  });

  describe('submitRating', () => {
    it('should create new rating and update character averages', async () => {
      const ratingData = {
        quality: 5,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 5,
      };

      await service.submitRating(testCharacterId, testUserId, ratingData);

      // Verify rating was created
      const [rating] = await db
        .select()
        .from(ratings)
        .where(eq(ratings.characterId, testCharacterId));

      expect(rating).toBeDefined();
      expect(rating.quality).toBe(5);
      expect(rating.creativity).toBe(4);

      // Verify character averages were updated
      const [character] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, testCharacterId));

      expect(character.ratingQualityAvg).toBe('5.00');
      expect(character.ratingCreativityAvg).toBe('4.00');
      expect(character.ratingInteractivityAvg).toBe('4.00');
      expect(character.ratingAccuracyAvg).toBe('4.00');
      expect(character.ratingEntertainmentAvg).toBe('5.00');
      expect(character.ratingOverallAvg).toBe('4.40'); // (5+4+4+4+5)/5
      expect(character.ratingCount).toBe(1);
    });

    it('should update existing rating and recalculate averages', async () => {
      // Submit first rating
      await service.submitRating(testCharacterId, testUserId, {
        quality: 5,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 5,
      });

      // Submit updated rating
      await service.submitRating(testCharacterId, testUserId, {
        quality: 3,
        creativity: 3,
        interactivity: 3,
        accuracy: 3,
        entertainment: 3,
      });

      // Verify only one rating exists
      const allRatings = await db
        .select()
        .from(ratings)
        .where(eq(ratings.characterId, testCharacterId));

      expect(allRatings).toHaveLength(1);
      expect(allRatings[0].quality).toBe(3);

      // Verify character averages were updated
      const [character] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, testCharacterId));

      expect(character.ratingQualityAvg).toBe('3.00');
      expect(character.ratingOverallAvg).toBe('3.00');
    });

    it('should calculate correct averages with multiple ratings', async () => {
      // User 1 rates
      await service.submitRating(testCharacterId, testUserId, {
        quality: 5,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 5,
      });

      // User 2 rates
      await service.submitRating(testCharacterId, testUser2Id, {
        quality: 3,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 3,
      });

      // Verify character averages
      const [character] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, testCharacterId));

      expect(character.ratingQualityAvg).toBe('4.00'); // (5+3)/2
      expect(character.ratingCreativityAvg).toBe('4.00'); // (4+4)/2
      expect(character.ratingEntertainmentAvg).toBe('4.00'); // (5+3)/2
      expect(character.ratingOverallAvg).toBe('4.00'); // (4+4+4+4+4)/5
      expect(character.ratingCount).toBe(2);
    });

    it('should handle transaction rollback on error', async () => {
      // This test verifies atomicity - if character update fails, rating should not be created
      const invalidCharacterId = '00000000-0000-0000-0000-000000000000';

      await expect(
        service.submitRating(invalidCharacterId, testUserId, {
          quality: 5,
          creativity: 4,
          interactivity: 4,
          accuracy: 4,
          entertainment: 5,
        })
      ).rejects.toThrow();

      // Verify no rating was created
      const allRatings = await db
        .select()
        .from(ratings)
        .where(eq(ratings.userId, testUserId));

      expect(allRatings).toHaveLength(0);
    });
  });

  describe('getRatings', () => {
    it('should return rating details with user rating', async () => {
      // Submit ratings from two users
      await service.submitRating(testCharacterId, testUserId, {
        quality: 5,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 5,
      });

      await service.submitRating(testCharacterId, testUser2Id, {
        quality: 3,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 3,
      });

      const result = await service.getRatings(testCharacterId, testUserId);

      expect(result.overall).toBe('4.00');
      expect(result.dimensions.quality).toBe('4.00');
      expect(result.dimensions.creativity).toBe('4.00');
      expect(result.count).toBe(2);
      expect(result.userRating).toBeDefined();
      expect(result.userRating?.quality).toBe(5);
    });

    it('should return null userRating if user has not rated', async () => {
      await service.submitRating(testCharacterId, testUser2Id, {
        quality: 3,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 3,
      });

      const result = await service.getRatings(testCharacterId, testUserId);

      expect(result.count).toBe(1);
      expect(result.userRating).toBeNull();
    });

    it('should return zero count if no ratings exist', async () => {
      const result = await service.getRatings(testCharacterId, testUserId);

      expect(result.overall).toBeNull();
      expect(result.count).toBe(0);
      expect(result.userRating).toBeNull();
    });
  });

  describe('updateRating', () => {
    it('should update existing rating', async () => {
      await service.submitRating(testCharacterId, testUserId, {
        quality: 5,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 5,
      });

      await service.updateRating(testCharacterId, testUserId, {
        quality: 3,
        creativity: 3,
        interactivity: 3,
        accuracy: 3,
        entertainment: 3,
      });

      const [character] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, testCharacterId));

      expect(character.ratingQualityAvg).toBe('3.00');
      expect(character.ratingOverallAvg).toBe('3.00');
    });

    it('should throw error if rating does not exist', async () => {
      await expect(
        service.updateRating(testCharacterId, testUserId, {
          quality: 5,
          creativity: 4,
          interactivity: 4,
          accuracy: 4,
          entertainment: 5,
        })
      ).rejects.toThrow('Rating not found');
    });
  });

  describe('deleteRating', () => {
    it('should delete rating and recalculate averages', async () => {
      // Create two ratings
      await service.submitRating(testCharacterId, testUserId, {
        quality: 5,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 5,
      });

      await service.submitRating(testCharacterId, testUser2Id, {
        quality: 3,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 3,
      });

      // Delete first rating
      await service.deleteRating(testCharacterId, testUserId);

      // Verify rating was deleted
      const allRatings = await db
        .select()
        .from(ratings)
        .where(eq(ratings.characterId, testCharacterId));

      expect(allRatings).toHaveLength(1);

      // Verify averages were recalculated
      const [character] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, testCharacterId));

      expect(character.ratingQualityAvg).toBe('3.00');
      expect(character.ratingCount).toBe(1);
    });

    it('should set averages to null when last rating is deleted', async () => {
      await service.submitRating(testCharacterId, testUserId, {
        quality: 5,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 5,
      });

      await service.deleteRating(testCharacterId, testUserId);

      const [character] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, testCharacterId));

      expect(character.ratingQualityAvg).toBeNull();
      expect(character.ratingOverallAvg).toBeNull();
      expect(character.ratingCount).toBe(0);
    });

    it('should throw error if rating does not exist', async () => {
      await expect(
        service.deleteRating(testCharacterId, testUserId)
      ).rejects.toThrow('Rating not found');
    });
  });
});
