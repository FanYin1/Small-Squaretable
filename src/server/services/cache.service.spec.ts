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
});
