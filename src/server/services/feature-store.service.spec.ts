import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/redis', () => ({
  getRedisClient: vi.fn().mockResolvedValue({
    hGetAll: vi.fn().mockResolvedValue({}),
    hSet: vi.fn(),
    zRangeWithScores: vi.fn().mockResolvedValue([]),
    lRange: vi.fn().mockResolvedValue([]),
  }),
}));

describe('FeatureStoreService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should get user profile from Redis hash', async () => {
    const { featureStoreService } = await import('./feature-store.service');
    const profile = await featureStoreService.getUserProfile('user-1');
    expect(profile).toBeDefined();
  });

  it('should get trending characters', async () => {
    const { featureStoreService } = await import('./feature-store.service');
    const trending = await featureStoreService.getTrending(10);
    expect(Array.isArray(trending)).toBe(true);
  });

  it('should get user recent interactions', async () => {
    const { featureStoreService } = await import('./feature-store.service');
    const recent = await featureStoreService.getUserRecent('user-1', 10);
    expect(Array.isArray(recent)).toBe(true);
  });
});
