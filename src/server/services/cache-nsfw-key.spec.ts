/**
 * 缓存键必须区分 NSFW 可见性（P2-6）
 *
 * marketplace / 搜索的结果因观看者偏好而不同。键不区分的话，偏好开的用户
 * 写进缓存的列表会被偏好关的用户命中，等于绕过了服务端过滤。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn().mockResolvedValue(null);
const mockSet = vi.fn().mockResolvedValue('OK');

vi.mock('../../core/redis', () => ({
  redis: {
    get: (...args: unknown[]) => mockGet(...args),
    set: (...args: unknown[]) => mockSet(...args),
    del: vi.fn(),
    keys: vi.fn(),
  },
  getRedisClient: vi.fn().mockResolvedValue({}),
}));

vi.mock('./logger.service', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../core/config', () => ({
  config: { nodeEnv: 'test', cacheTtlDefault: 300 },
}));

const keyOf = (call: unknown[]) => String(call[0]);

describe('cache keys vary with NSFW visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue('OK');
  });

  it('marketplace：偏好开与偏好关读不同的键', async () => {
    const { cacheService } = await import('./cache.service');
    await cacheService.getCachedMarketplace(1, 20, false);
    await cacheService.getCachedMarketplace(1, 20, true);

    expect(keyOf(mockGet.mock.calls[0])).not.toBe(keyOf(mockGet.mock.calls[1]));
  });

  it('marketplace：默认参数的键与偏好关一致（未改动的调用方不受影响）', async () => {
    const { cacheService } = await import('./cache.service');
    await cacheService.getCachedMarketplace(1, 20);
    await cacheService.getCachedMarketplace(1, 20, false);

    expect(keyOf(mockGet.mock.calls[0])).toBe(keyOf(mockGet.mock.calls[1]));
  });

  it('marketplace：写入用的键与读取用的键对应', async () => {
    const { cacheService } = await import('./cache.service');
    await cacheService.setCachedMarketplace(1, 20, { a: 1 }, true);
    await cacheService.getCachedMarketplace(1, 20, true);

    expect(keyOf(mockSet.mock.calls[0])).toBe(keyOf(mockGet.mock.calls[0]));
  });

  it('search：偏好开与偏好关读不同的键', async () => {
    const { cacheService } = await import('./cache.service');
    await cacheService.getCachedSearch('wizard', 'relevance', undefined, undefined, 1, 20, false);
    await cacheService.getCachedSearch('wizard', 'relevance', undefined, undefined, 1, 20, true);

    expect(keyOf(mockGet.mock.calls[0])).not.toBe(keyOf(mockGet.mock.calls[1]));
  });

  it('search：写入用的键与读取用的键对应', async () => {
    const { cacheService } = await import('./cache.service');
    await cacheService.setCachedSearch('wizard', 'relevance', undefined, undefined, 1, 20, { a: 1 }, true);
    await cacheService.getCachedSearch('wizard', 'relevance', undefined, undefined, 1, 20, true);

    expect(keyOf(mockSet.mock.calls[0])).toBe(keyOf(mockGet.mock.calls[0]));
  });
});
