/**
 * RatingRepository unit tests (mocked DB)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../index', () => {
  const mockDb: any = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    orderBy: vi.fn().mockReturnThis(),
  };
  return { db: mockDb };
});

vi.mock('../schema/ratings', () => ({
  ratings: {
    id: 'id',
    characterId: 'character_id',
    userId: 'user_id',
    quality: 'quality',
    creativity: 'creativity',
    interactivity: 'interactivity',
    accuracy: 'accuracy',
    entertainment: 'entertainment',
    updatedAt: 'updated_at',
  },
}));

vi.mock('../schema/characters', () => ({
  characters: { id: 'id', commentCount: 'comment_count', favoriteCount: 'favorite_count' },
}));
vi.mock('../schema/users', () => ({
  users: { id: 'id', tenantId: 'tenant_id' },
}));
vi.mock('../schema/tenants', () => ({
  tenants: { id: 'id' },
}));

import { RatingRepository } from './rating.repository';
import { db } from '../index';

const mockDb = db as any;

function resetChains() {
  mockDb.insert.mockReturnThis();
  mockDb.values.mockReturnThis();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
  mockDb.delete.mockReturnThis();
  mockDb.onConflictDoUpdate.mockReturnThis();
  mockDb.orderBy.mockReturnThis();
}

describe('RatingRepository', () => {
  let repository: RatingRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    resetChains();
    repository = new RatingRepository(mockDb);
  });

  describe('create', () => {
    it('should create a new rating', async () => {
      const fakeRating = {
        id: 'rating-1',
        characterId: 'char-1',
        userId: 'user-1',
        quality: 5,
        creativity: 4,
        interactivity: 4,
        accuracy: 4,
        entertainment: 5,
      };
      mockDb.returning.mockResolvedValueOnce([fakeRating]);

      const rating = await repository.create(fakeRating as any);

      expect(rating.id).toBe('rating-1');
      expect(rating.quality).toBe(5);
      expect(rating.creativity).toBe(4);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw on duplicate rating', async () => {
      mockDb.returning.mockRejectedValueOnce(new Error('unique constraint'));

      await expect(repository.create({} as any)).rejects.toThrow();
    });
  });

  describe('findByCharacterAndUser', () => {
    it('should find rating by character and user', async () => {
      const fakeRating = { id: 'rating-1', characterId: 'char-1', userId: 'user-1' };
      mockDb.where.mockResolvedValueOnce([fakeRating]);

      const found = await repository.findByCharacterAndUser('char-1', 'user-1');

      expect(found).toBeDefined();
      expect(found?.characterId).toBe('char-1');
      expect(found?.userId).toBe('user-1');
    });

    it('should return null if rating not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const found = await repository.findByCharacterAndUser('char-1', 'user-1');

      expect(found).toBeNull();
    });
  });

  describe('findByCharacterId', () => {
    it('should find all ratings for a character', async () => {
      const fakeRatings = [
        { id: 'r1', userId: 'user-1' },
        { id: 'r2', userId: 'user-2' },
      ];
      mockDb.where.mockResolvedValueOnce(fakeRatings);

      const allRatings = await repository.findByCharacterId('char-1');

      expect(allRatings).toHaveLength(2);
      expect(allRatings.some((r: any) => r.userId === 'user-1')).toBe(true);
      expect(allRatings.some((r: any) => r.userId === 'user-2')).toBe(true);
    });
  });

  describe('upsert', () => {
    it('should insert new rating if not exists', async () => {
      const fakeRating = { id: 'rating-1', quality: 5 };
      mockDb.returning.mockResolvedValueOnce([fakeRating]);

      const rating = await repository.upsert({ quality: 5 } as any);

      expect(rating.quality).toBe(5);
      expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
    });

    it('should update existing rating if exists', async () => {
      const fakeRating = { id: 'rating-1', quality: 3, creativity: 3, interactivity: 4 };
      mockDb.returning.mockResolvedValueOnce([fakeRating]);

      const updated = await repository.upsert({ quality: 3, creativity: 3 } as any);

      expect(updated.quality).toBe(3);
      expect(updated.creativity).toBe(3);
    });
  });

  describe('delete', () => {
    it('should delete rating by character and user', async () => {
      mockDb.returning.mockResolvedValueOnce([{ id: 'rating-1' }]);

      const deleted = await repository.delete('char-1', 'user-1');

      expect(deleted).toBe(true);
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should return false if rating not found', async () => {
      mockDb.returning.mockResolvedValueOnce([]);

      const deleted = await repository.delete('char-1', 'user-1');

      expect(deleted).toBe(false);
    });
  });

  describe('getAverageRatings', () => {
    it('should calculate average ratings for a character', async () => {
      const fakeAvg = {
        quality: '4.00',
        creativity: '4.00',
        interactivity: '4.00',
        accuracy: '4.00',
        entertainment: '4.00',
        count: 2,
      };
      mockDb.where.mockResolvedValueOnce([fakeAvg]);

      const averages = await repository.getAverageRatings('char-1');

      expect(averages.quality).toBe('4.00');
      expect(averages.count).toBe(2);
    });

    it('should return null values if no ratings exist', async () => {
      const fakeAvg = {
        quality: null,
        creativity: null,
        interactivity: null,
        accuracy: null,
        entertainment: null,
        count: 0,
      };
      mockDb.where.mockResolvedValueOnce([fakeAvg]);

      const averages = await repository.getAverageRatings('char-1');

      expect(averages.quality).toBeNull();
      expect(averages.count).toBe(0);
    });
  });
});
