/**
 * RatingService 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock db – the service calls db.transaction() directly in submitRating / deleteRating
const mockTx = {
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../../db/index', () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<void>) => cb(mockTx)),
  },
}));

vi.mock('../../db/repositories/rating.repository', () => ({
  ratingRepository: {
    getAverageRatings: vi.fn(),
    findByCharacterAndUser: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
  RatingRepository: class {},
}));

vi.mock('../../db/repositories/character.repository', () => ({
  characterRepository: {
    findById: vi.fn(),
    update: vi.fn(),
  },
  CharacterRepository: class {},
}));

// Schema mocks – just need to exist so drizzle helpers don't blow up
vi.mock('../../db/schema/ratings', () => ({
  ratings: {
    characterId: 'characterId',
    userId: 'userId',
    quality: 'quality',
    creativity: 'creativity',
    interactivity: 'interactivity',
    accuracy: 'accuracy',
    entertainment: 'entertainment',
  },
}));

vi.mock('../../db/schema/characters', () => ({
  characters: {
    id: 'id',
  },
}));

import { RatingService } from './rating.service';
import { ratingRepository } from '../../db/repositories/rating.repository';
import { NotFoundError } from '../../core/errors';

// ── Helpers ────────────────────────────────────────────────────────────────

const CHAR_ID = 'char-1';
const USER_ID = 'user-1';
const USER2_ID = 'user-2';

const sampleInput = {
  quality: 5,
  creativity: 4,
  interactivity: 4,
  accuracy: 4,
  entertainment: 5,
};

/** Build a fluent chain that ends with the given resolved value. */
function chain(resolvedValue: unknown) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.values = vi.fn().mockReturnValue(obj);
  obj.onConflictDoUpdate = vi.fn().mockReturnValue(obj);
  obj.set = vi.fn().mockReturnValue(obj);
  obj.from = vi.fn().mockReturnValue(obj);
  obj.where = vi.fn().mockReturnValue(obj);
  obj.returning = vi.fn().mockResolvedValue(resolvedValue);
  // select() needs to resolve as an array when awaited
  obj.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));
  return obj;
}

describe('RatingService', () => {
  let service: RatingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RatingService();
  });

  // ── submitRating ───────────────────────────────────────────────────────

  describe('submitRating', () => {
    it('should create new rating and update character averages', async () => {
      // insert chain (upsert rating)
      const insertChain = chain(undefined);
      mockTx.insert.mockReturnValue(insertChain);

      // select chain (AVG query)
      const selectChain = chain([{
        quality: '5.00', creativity: '4.00', interactivity: '4.00',
        accuracy: '4.00', entertainment: '5.00', count: 1,
      }]);
      mockTx.select.mockReturnValue(selectChain);

      // update chain (character update)
      const updateChain = chain(undefined);
      mockTx.update.mockReturnValue(updateChain);

      await service.submitRating(CHAR_ID, USER_ID, sampleInput);

      expect(mockTx.insert).toHaveBeenCalled();
      expect(mockTx.select).toHaveBeenCalled();
      expect(mockTx.update).toHaveBeenCalled();
    });

    it('should update existing rating and recalculate averages', async () => {
      const insertChain = chain(undefined);
      mockTx.insert.mockReturnValue(insertChain);

      const selectChain = chain([{
        quality: '3.00', creativity: '3.00', interactivity: '3.00',
        accuracy: '3.00', entertainment: '3.00', count: 1,
      }]);
      mockTx.select.mockReturnValue(selectChain);

      const updateChain = chain(undefined);
      mockTx.update.mockReturnValue(updateChain);

      await service.submitRating(CHAR_ID, USER_ID, {
        quality: 3, creativity: 3, interactivity: 3, accuracy: 3, entertainment: 3,
      });

      expect(mockTx.insert).toHaveBeenCalled();
      expect(mockTx.update).toHaveBeenCalled();
    });

    it('should calculate correct averages with multiple ratings', async () => {
      const insertChain = chain(undefined);
      mockTx.insert.mockReturnValue(insertChain);

      const selectChain = chain([{
        quality: '4.00', creativity: '4.00', interactivity: '4.00',
        accuracy: '4.00', entertainment: '4.00', count: 2,
      }]);
      mockTx.select.mockReturnValue(selectChain);

      const updateChain = chain(undefined);
      mockTx.update.mockReturnValue(updateChain);

      await service.submitRating(CHAR_ID, USER2_ID, {
        quality: 3, creativity: 4, interactivity: 4, accuracy: 4, entertainment: 3,
      });

      expect(mockTx.insert).toHaveBeenCalled();
      expect(mockTx.update).toHaveBeenCalled();
    });

    it('should handle transaction rollback on error', async () => {
      // Make insert throw to simulate a DB error
      const insertChain = chain(undefined);
      insertChain.values = vi.fn().mockReturnValue(insertChain);
      insertChain.onConflictDoUpdate = vi.fn().mockRejectedValue(new Error('FK violation'));
      mockTx.insert.mockReturnValue(insertChain);

      await expect(
        service.submitRating('bad-id', USER_ID, sampleInput)
      ).rejects.toThrow();
    });
  });

  // ── getRatings ─────────────────────────────────────────────────────────

  describe('getRatings', () => {
    it('should return rating details with user rating', async () => {
      vi.mocked(ratingRepository.getAverageRatings).mockResolvedValue({
        quality: '4.00', creativity: '4.00', interactivity: '4.00',
        accuracy: '4.00', entertainment: '4.00', count: 2,
      });
      vi.mocked(ratingRepository.findByCharacterAndUser).mockResolvedValue({
        id: 'r1', characterId: CHAR_ID, userId: USER_ID,
        quality: 5, creativity: 4, interactivity: 4, accuracy: 4, entertainment: 5,
        createdAt: new Date(), updatedAt: new Date(),
      } as any);

      const result = await service.getRatings(CHAR_ID, USER_ID);

      expect(result.overall).toBe('4.00');
      expect(result.dimensions.quality).toBe('4.00');
      expect(result.count).toBe(2);
      expect(result.userRating).toBeDefined();
      expect(result.userRating?.quality).toBe(5);
    });

    it('should return null userRating if user has not rated', async () => {
      vi.mocked(ratingRepository.getAverageRatings).mockResolvedValue({
        quality: '3.00', creativity: '4.00', interactivity: '4.00',
        accuracy: '4.00', entertainment: '3.00', count: 1,
      });
      vi.mocked(ratingRepository.findByCharacterAndUser).mockResolvedValue(null);

      const result = await service.getRatings(CHAR_ID, USER_ID);

      expect(result.count).toBe(1);
      expect(result.userRating).toBeNull();
    });

    it('should return zero count if no ratings exist', async () => {
      vi.mocked(ratingRepository.getAverageRatings).mockResolvedValue({
        quality: null, creativity: null, interactivity: null,
        accuracy: null, entertainment: null, count: 0,
      });

      const result = await service.getRatings(CHAR_ID, USER_ID);

      expect(result.overall).toBeNull();
      expect(result.count).toBe(0);
      expect(result.userRating).toBeNull();
    });
  });

  // ── updateRating ───────────────────────────────────────────────────────

  describe('updateRating', () => {
    it('should update existing rating', async () => {
      vi.mocked(ratingRepository.findByCharacterAndUser).mockResolvedValue({
        id: 'r1', characterId: CHAR_ID, userId: USER_ID,
        quality: 5, creativity: 4, interactivity: 4, accuracy: 4, entertainment: 5,
        createdAt: new Date(), updatedAt: new Date(),
      } as any);

      // submitRating is called internally – set up tx mocks
      const insertChain = chain(undefined);
      mockTx.insert.mockReturnValue(insertChain);
      const selectChain = chain([{
        quality: '3.00', creativity: '3.00', interactivity: '3.00',
        accuracy: '3.00', entertainment: '3.00', count: 1,
      }]);
      mockTx.select.mockReturnValue(selectChain);
      const updateChain = chain(undefined);
      mockTx.update.mockReturnValue(updateChain);

      await service.updateRating(CHAR_ID, USER_ID, {
        quality: 3, creativity: 3, interactivity: 3, accuracy: 3, entertainment: 3,
      });

      expect(ratingRepository.findByCharacterAndUser).toHaveBeenCalledWith(CHAR_ID, USER_ID);
      expect(mockTx.insert).toHaveBeenCalled();
    });

    it('should throw error if rating does not exist', async () => {
      vi.mocked(ratingRepository.findByCharacterAndUser).mockResolvedValue(null);

      await expect(
        service.updateRating(CHAR_ID, USER_ID, sampleInput)
      ).rejects.toThrow('Rating not found');
    });
  });

  // ── deleteRating ───────────────────────────────────────────────────────

  describe('deleteRating', () => {
    it('should delete rating and recalculate averages', async () => {
      const deleteChain = chain([{ id: 'r1' }]);
      mockTx.delete.mockReturnValue(deleteChain);

      const selectChain = chain([{
        quality: '3.00', creativity: '4.00', interactivity: '4.00',
        accuracy: '4.00', entertainment: '3.00', count: 1,
      }]);
      mockTx.select.mockReturnValue(selectChain);

      const updateChain = chain(undefined);
      mockTx.update.mockReturnValue(updateChain);

      await service.deleteRating(CHAR_ID, USER_ID);

      expect(mockTx.delete).toHaveBeenCalled();
      expect(mockTx.update).toHaveBeenCalled();
    });

    it('should set averages to null when last rating is deleted', async () => {
      const deleteChain = chain([{ id: 'r1' }]);
      mockTx.delete.mockReturnValue(deleteChain);

      const selectChain = chain([{
        quality: null, creativity: null, interactivity: null,
        accuracy: null, entertainment: null, count: 0,
      }]);
      mockTx.select.mockReturnValue(selectChain);

      const updateChain = chain(undefined);
      mockTx.update.mockReturnValue(updateChain);

      await service.deleteRating(CHAR_ID, USER_ID);

      expect(mockTx.delete).toHaveBeenCalled();
      expect(mockTx.update).toHaveBeenCalled();
    });

    it('should throw error if rating does not exist', async () => {
      // returning() resolves to empty array → NotFoundError
      const deleteChain = chain([]);
      mockTx.delete.mockReturnValue(deleteChain);

      await expect(
        service.deleteRating(CHAR_ID, USER_ID)
      ).rejects.toThrow('Rating not found');
    });
  });
});
