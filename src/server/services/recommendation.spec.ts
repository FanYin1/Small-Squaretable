import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted mock functions (available inside vi.mock factories) ---

const {
  mockRedisGet,
  mockRedisSet,
  mockGetTrending,
  mockGetUserInterests,
  mockGetUserRecent,
  mockFindById,
  mockFindPublicByTags,
} = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockGetTrending: vi.fn(),
  mockGetUserInterests: vi.fn(),
  mockGetUserRecent: vi.fn(),
  mockFindById: vi.fn(),
  mockFindPublicByTags: vi.fn(),
}));

vi.mock('../../core/redis', () => ({
  getRedisClient: vi.fn().mockResolvedValue({
    get: mockRedisGet,
    set: mockRedisSet,
  }),
}));

vi.mock('./feature-store.service', () => ({
  featureStoreService: {
    getTrending: (...args: unknown[]) => mockGetTrending(...args),
    getUserInterests: (...args: unknown[]) => mockGetUserInterests(...args),
    getUserRecent: (...args: unknown[]) => mockGetUserRecent(...args),
  },
}));

vi.mock('../../db/repositories/character.repository', () => ({
  characterRepository: {
    findById: (...args: unknown[]) => mockFindById(...args),
    findPublicByTags: (...args: unknown[]) => mockFindPublicByTags(...args),
  },
}));

vi.mock('./experiment.service', () => ({
  experimentService: {
    getVariantConfig: vi.fn().mockResolvedValue(null),
  },
}));

import { RecommendationService } from './recommendation.service';

describe('RecommendationService', () => {
  let service: RecommendationService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
    mockGetTrending.mockResolvedValue([]);
    mockGetUserInterests.mockResolvedValue([]);
    mockGetUserRecent.mockResolvedValue([]);
    mockFindById.mockResolvedValue(null);
    mockFindPublicByTags.mockResolvedValue([]);
    service = new RecommendationService();
  });

  describe('getTrending', () => {
    it('should return items from feature store', async () => {
      mockGetTrending.mockResolvedValue([
        { characterId: 'char-1', score: 100 },
        { characterId: 'char-2', score: 80 },
      ]);

      const results = await service.getTrending(10);

      expect(mockGetTrending).toHaveBeenCalledWith(10);
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ characterId: 'char-1', score: 100, source: 'trending' });
      expect(results[1]).toEqual({ characterId: 'char-2', score: 80, source: 'trending' });
    });

    it('should return empty array when no trending data', async () => {
      const results = await service.getTrending();
      expect(results).toEqual([]);
    });
  });

  describe('getPersonalized', () => {
    it('should blend trending and collaborative strategies', async () => {
      mockGetTrending.mockResolvedValue([
        { characterId: 'char-1', score: 100 },
        { characterId: 'char-2', score: 50 },
      ]);
      mockGetUserInterests.mockResolvedValue([
        { tag: 'fantasy', score: 0.9 },
        { tag: 'rpg', score: 0.7 },
      ]);
      mockGetUserRecent.mockResolvedValue([]);
      mockFindPublicByTags.mockResolvedValue([
        { id: 'char-3', tags: ['fantasy', 'rpg'] },
        { id: 'char-1', tags: ['fantasy'] },
      ]);

      const results = await service.getPersonalized('user-1', 10);

      expect(results.length).toBeGreaterThan(0);
      // char-1 should appear (from both trending and collaborative)
      const char1 = results.find((r) => r.characterId === 'char-1');
      expect(char1).toBeDefined();
      // char-3 should appear (collaborative only)
      const char3 = results.find((r) => r.characterId === 'char-3');
      expect(char3).toBeDefined();
      expect(char3!.source).toBe('collaborative');
    });

    it('should filter out recently viewed characters', async () => {
      mockGetTrending.mockResolvedValue([
        { characterId: 'char-1', score: 100 },
        { characterId: 'char-2', score: 80 },
      ]);
      mockGetUserInterests.mockResolvedValue([]);
      mockGetUserRecent.mockResolvedValue(['char-1']);

      const results = await service.getPersonalized('user-1', 10);

      const char1 = results.find((r) => r.characterId === 'char-1');
      expect(char1).toBeUndefined();
      const char2 = results.find((r) => r.characterId === 'char-2');
      expect(char2).toBeDefined();
    });

    it('should use cached results on second call', async () => {
      const cachedData = JSON.stringify([
        { characterId: 'cached-1', score: 99, source: 'trending' },
      ]);
      mockRedisGet.mockResolvedValue(cachedData);

      const results = await service.getPersonalized('user-1', 10);

      expect(results).toHaveLength(1);
      expect(results[0].characterId).toBe('cached-1');
      // Feature store should NOT have been called
      expect(mockGetTrending).not.toHaveBeenCalled();
      expect(mockGetUserInterests).not.toHaveBeenCalled();
    });

    it('should cache results with 15-min TTL', async () => {
      mockGetTrending.mockResolvedValue([{ characterId: 'char-1', score: 50 }]);
      mockGetUserInterests.mockResolvedValue([]);
      mockGetUserRecent.mockResolvedValue([]);

      await service.getPersonalized('user-1', 10);

      expect(mockRedisSet).toHaveBeenCalledWith(
        'rec:personalized:user-1',
        expect.any(String),
        { EX: 900 },
      );
    });
  });

  describe('getSimilar', () => {
    it('should return tag-matched characters excluding self', async () => {
      mockFindById.mockResolvedValue({
        id: 'char-1',
        tags: ['fantasy', 'adventure'],
      });
      mockFindPublicByTags.mockResolvedValue([
        { id: 'char-1', tags: ['fantasy', 'adventure'] },
        { id: 'char-2', tags: ['fantasy'] },
        { id: 'char-3', tags: ['fantasy', 'adventure', 'rpg'] },
      ]);

      const results = await service.getSimilar('char-1', 10);

      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.characterId);
      expect(ids).not.toContain('char-1');
      expect(ids).toContain('char-2');
      expect(ids).toContain('char-3');
      results.forEach((r) => expect(r.source).toBe('content-based'));
    });

    it('should return empty array when character not found', async () => {
      mockFindById.mockResolvedValue(null);
      const results = await service.getSimilar('nonexistent');
      expect(results).toEqual([]);
    });

    it('should return empty array when character has no tags', async () => {
      mockFindById.mockResolvedValue({ id: 'char-1', tags: [] });
      const results = await service.getSimilar('char-1');
      expect(results).toEqual([]);
    });
  });
});
