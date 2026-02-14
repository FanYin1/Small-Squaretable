import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedis = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
};

vi.mock('../../core/redis', () => ({
  getRedisClient: vi.fn().mockResolvedValue(mockRedis),
}));

vi.mock('./experiment.service', () => ({
  experimentService: {
    getVariantConfig: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('./feature-store.service', () => ({
  featureStoreService: {
    getTrending: vi.fn().mockResolvedValue([
      { characterId: 'char-1', score: 10 },
      { characterId: 'char-2', score: 8 },
    ]),
    getUserInterests: vi.fn().mockResolvedValue([]),
    getUserRecent: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../db/repositories/character.repository', () => ({
  characterRepository: {
    findPublicByTags: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
  },
}));

describe('RecommendationService - Experiment Integration', () => {
  let recommendationService: typeof import('./recommendation.service').recommendationService;
  let experimentService: typeof import('./experiment.service').experimentService;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    const recMod = await import('./recommendation.service');
    recommendationService = recMod.recommendationService;
    const expMod = await import('./experiment.service');
    experimentService = expMod.experimentService;
  });

  it('uses experiment weights when experiment is active', async () => {
    vi.mocked(experimentService.getVariantConfig).mockResolvedValueOnce({
      variant: 'high-trending',
      trending: 0.8,
      collaborative: 0.2,
    });

    const results = await recommendationService.getPersonalized('user-1', 10);

    // Verify experiment service was called with correct args
    expect(experimentService.getVariantConfig).toHaveBeenCalledWith('user-1', 'recommendation-weights');

    // Trending scores should use 0.8 weight (experiment) instead of 0.4 (default)
    // char-1 score=10 * 0.8 = 8, char-2 score=8 * 0.8 = 6.4
    expect(results).toHaveLength(2);
    expect(results[0].score).toBeCloseTo(8);
    expect(results[1].score).toBeCloseTo(6.4);
  });

  it('uses default weights when no experiment is active', async () => {
    vi.mocked(experimentService.getVariantConfig).mockResolvedValueOnce(null);

    const results = await recommendationService.getPersonalized('user-1', 10);

    expect(experimentService.getVariantConfig).toHaveBeenCalledWith('user-1', 'recommendation-weights');

    // Default trending weight is 0.4
    // char-1 score=10 * 0.4 = 4, char-2 score=8 * 0.4 = 3.2
    expect(results).toHaveLength(2);
    expect(results[0].score).toBeCloseTo(4);
    expect(results[1].score).toBeCloseTo(3.2);
  });

  it('cache key includes variant name to prevent cross-variant cache hits', async () => {
    vi.mocked(experimentService.getVariantConfig).mockResolvedValueOnce({
      variant: 'high-trending',
      trending: 0.8,
      collaborative: 0.2,
    });

    await recommendationService.getPersonalized('user-1', 10);

    // The cache set call should use a key that includes the variant
    expect(mockRedis.set).toHaveBeenCalledWith(
      'rec:personalized:user-1:high-trending',
      expect.any(String),
      { EX: 900 },
    );
  });

  it('cache key has no variant suffix when no experiment is active', async () => {
    vi.mocked(experimentService.getVariantConfig).mockResolvedValueOnce(null);

    await recommendationService.getPersonalized('user-1', 10);

    // Without experiment, cache key should be the plain user key
    expect(mockRedis.set).toHaveBeenCalledWith(
      'rec:personalized:user-1',
      expect.any(String),
      { EX: 900 },
    );
  });
});
