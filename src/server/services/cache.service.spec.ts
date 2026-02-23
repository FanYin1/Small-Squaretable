import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDel = vi.fn().mockResolvedValue(1);
const mockGet = vi.fn().mockResolvedValue(null);
const mockSet = vi.fn().mockResolvedValue('OK');
const mockKeys = vi.fn();

vi.mock('../../core/redis', () => ({
  redis: {
    get: (...args: any[]) => mockGet(...args),
    set: (...args: any[]) => mockSet(...args),
    del: (...args: any[]) => mockDel(...args),
    keys: mockKeys,
  },
  getRedisClient: vi.fn().mockResolvedValue({
    scanIterator: function* () {
      yield 'key1';
      yield 'key2';
    },
    del: mockDel,
  }),
}));

vi.mock('./logger.service', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../core/config', () => ({
  config: {
    nodeEnv: 'test',
    cacheTtlDefault: 300,
  },
}));

describe('CacheService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue('OK');
    mockDel.mockResolvedValue(1);
  });

  it('deletePattern should use SCAN instead of KEYS', async () => {
    const { cacheService } = await import('./cache.service');
    await cacheService.deletePattern('api:*');
    expect(mockKeys).not.toHaveBeenCalled();
    expect(mockDel).toHaveBeenCalled();
  });

  it('get should return parsed JSON on cache hit', async () => {
    mockGet.mockResolvedValue('{"name":"test"}');
    const { cacheService } = await import('./cache.service');
    const result = await cacheService.get<{ name: string }>('test-key');
    expect(result).toEqual({ name: 'test' });
  });

  it('get should return null on cache miss', async () => {
    mockGet.mockResolvedValue(null);
    const { cacheService } = await import('./cache.service');
    const result = await cacheService.get('missing-key');
    expect(result).toBeNull();
  });

  it('set should call redis.set with TTL', async () => {
    const { cacheService } = await import('./cache.service');
    await cacheService.set('key', { data: 1 }, 60);
    expect(mockSet).toHaveBeenCalledWith('key', '{"data":1}', { EX: 60 });
  });

  describe('getOrSet singleflight', () => {
    it('should return cached value without calling fetchFn on cache hit', async () => {
      mockGet.mockResolvedValue(JSON.stringify({ cached: true }));
      const { CacheService } = await import('./cache.service');
      const service = new CacheService();

      const fetchFn = vi.fn();
      const result = await service.getOrSet('hit-key', fetchFn);

      expect(result).toEqual({ cached: true });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('should call fetchFn on cache miss and store the result', async () => {
      mockGet.mockResolvedValue(null);
      mockSet.mockResolvedValue('OK');
      const { CacheService } = await import('./cache.service');
      const service = new CacheService();

      const fetchFn = vi.fn().mockResolvedValue({ fresh: true });
      const result = await service.getOrSet('miss-key', fetchFn, 120);

      expect(result).toEqual({ fresh: true });
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(mockSet).toHaveBeenCalledWith(
        'miss-key',
        JSON.stringify({ fresh: true }),
        { EX: 120 }
      );
    });

    it('should coalesce concurrent requests for the same key (singleflight)', async () => {
      mockGet.mockResolvedValue(null);
      mockSet.mockResolvedValue('OK');
      const { CacheService } = await import('./cache.service');
      const service = new CacheService();

      let resolvePromise!: (v: string) => void;
      const slowFetch = vi.fn(
        () => new Promise<string>((resolve) => { resolvePromise = resolve; })
      );

      // Fire two concurrent getOrSet calls
      const p1 = service.getOrSet('same-key', slowFetch);
      const p2 = service.getOrSet('same-key', slowFetch);

      // Flush microtasks so the await this.get() inside getOrSet resolves
      // and fetchFn gets called, assigning resolvePromise
      await new Promise((r) => setTimeout(r, 0));

      // Resolve the single fetch
      resolvePromise('shared-value');

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe('shared-value');
      expect(r2).toBe('shared-value');
      expect(slowFetch).toHaveBeenCalledTimes(1);
    });

    it('should clean up inflight map after fetchFn completes, allowing new fetches', async () => {
      mockGet.mockResolvedValue(null);
      mockSet.mockResolvedValue('OK');
      const { CacheService } = await import('./cache.service');
      const service = new CacheService();

      const fetchFn = vi.fn().mockResolvedValue('first');
      await service.getOrSet('cleanup-key', fetchFn);
      expect(fetchFn).toHaveBeenCalledTimes(1);

      // Second call after first completes should trigger a new fetch
      const fetchFn2 = vi.fn().mockResolvedValue('second');
      const result = await service.getOrSet('cleanup-key', fetchFn2);
      expect(result).toBe('second');
      expect(fetchFn2).toHaveBeenCalledTimes(1);
    });

    it('should clean up inflight map on fetchFn error and propagate to all waiters', async () => {
      mockGet.mockResolvedValue(null);
      const { CacheService } = await import('./cache.service');
      const service = new CacheService();

      let rejectPromise!: (err: Error) => void;
      const failingFetch = vi.fn(
        () => new Promise<string>((_, reject) => { rejectPromise = reject; })
      );

      const p1 = service.getOrSet('error-key', failingFetch);
      const p2 = service.getOrSet('error-key', failingFetch);

      // Flush microtasks so the await this.get() resolves and fetchFn is called
      await new Promise((r) => setTimeout(r, 0));

      rejectPromise(new Error('fetch failed'));

      await expect(p1).rejects.toThrow('fetch failed');
      await expect(p2).rejects.toThrow('fetch failed');
      expect(failingFetch).toHaveBeenCalledTimes(1);

      // After error, inflight is cleaned up — next call triggers a new fetch
      const retryFetch = vi.fn().mockResolvedValue('recovered');
      mockSet.mockResolvedValue('OK');
      const result = await service.getOrSet('error-key', retryFetch);
      expect(result).toBe('recovered');
      expect(retryFetch).toHaveBeenCalledTimes(1);
    });
  });
});
