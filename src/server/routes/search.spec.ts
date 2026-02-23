/**
 * Search Routes Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { searchRoutes } from './search';
import { errorHandler } from '../middleware/error-handler';

vi.mock('../services/search.service', () => ({
  searchService: {
    searchCharacters: vi.fn(),
  },
}));

vi.mock('../../db/repositories/message.repository', () => ({
  messageRepository: {
    searchGlobal: vi.fn(),
  },
}));

vi.mock('../../db/repositories/worldbook-entry.repository', () => ({
  worldBookEntryRepository: {
    searchByUser: vi.fn(),
  },
}));

vi.mock('../services/cache.service', () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('../../core/redis', () => ({
  getRedisClient: vi.fn().mockResolvedValue({
    lPush: vi.fn(),
    lTrim: vi.fn(),
    lRange: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', { id: 'user-1', tenantId: 'tenant-1' });
    await next();
  },
}));

vi.mock('../services/logger.service', () => {
  const mockLogger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => mockLogger),
  };
  return {
    createLogger: () => mockLogger,
    logger: mockLogger,
  };
});

vi.mock('../../db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
  },
}));

describe('Search Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/search', searchRoutes);
    app.onError(errorHandler);
    vi.clearAllMocks();
  });

  describe('GET /api/v1/search', () => {
    it('should return search results for valid query', async () => {
      const { searchService } = await import('../services/search.service');
      const { messageRepository } = await import('../../db/repositories/message.repository');
      const { worldBookEntryRepository } = await import('../../db/repositories/worldbook-entry.repository');
      const { cacheService } = await import('../services/cache.service');

      vi.mocked(cacheService.get).mockResolvedValue(null);
      vi.mocked(searchService.searchCharacters).mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      });
      vi.mocked(messageRepository.searchGlobal).mockResolvedValue([]);
      vi.mocked(worldBookEntryRepository.searchByUser).mockResolvedValue([]);

      const res = await app.request('/api/v1/search?q=test');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.characters).toEqual([]);
      expect(data.data.messages).toEqual([]);
      expect(data.data.worldbooks).toEqual([]);
    });

    it('should pass category filter to searchCharacters', async () => {
      const { searchService } = await import('../services/search.service');
      const { messageRepository } = await import('../../db/repositories/message.repository');
      const { worldBookEntryRepository } = await import('../../db/repositories/worldbook-entry.repository');
      const { cacheService } = await import('../services/cache.service');

      vi.mocked(cacheService.get).mockResolvedValue(null);
      vi.mocked(searchService.searchCharacters).mockResolvedValue({
        items: [{ id: 'char-1', name: 'Test', category: 'fantasy' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      });
      vi.mocked(messageRepository.searchGlobal).mockResolvedValue([]);
      vi.mocked(worldBookEntryRepository.searchByUser).mockResolvedValue([]);

      const res = await app.request('/api/v1/search?q=test&category=fantasy');

      expect(res.status).toBe(200);
      expect(searchService.searchCharacters).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'fantasy',
        })
      );
    });

    it('should split comma-separated tags and pass to searchCharacters', async () => {
      const { searchService } = await import('../services/search.service');
      const { messageRepository } = await import('../../db/repositories/message.repository');
      const { worldBookEntryRepository } = await import('../../db/repositories/worldbook-entry.repository');
      const { cacheService } = await import('../services/cache.service');

      vi.mocked(cacheService.get).mockResolvedValue(null);
      vi.mocked(searchService.searchCharacters).mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      });
      vi.mocked(messageRepository.searchGlobal).mockResolvedValue([]);
      vi.mocked(worldBookEntryRepository.searchByUser).mockResolvedValue([]);

      const res = await app.request('/api/v1/search?q=test&tags=tag1,tag2,tag3');

      expect(res.status).toBe(200);
      expect(searchService.searchCharacters).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['tag1', 'tag2', 'tag3'],
        })
      );
    });

    it('should trim and filter empty tags', async () => {
      const { searchService } = await import('../services/search.service');
      const { messageRepository } = await import('../../db/repositories/message.repository');
      const { worldBookEntryRepository } = await import('../../db/repositories/worldbook-entry.repository');
      const { cacheService } = await import('../services/cache.service');

      vi.mocked(cacheService.get).mockResolvedValue(null);
      vi.mocked(searchService.searchCharacters).mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      });
      vi.mocked(messageRepository.searchGlobal).mockResolvedValue([]);
      vi.mocked(worldBookEntryRepository.searchByUser).mockResolvedValue([]);

      const res = await app.request('/api/v1/search?q=test&tags=tag1,,%20,tag2');

      expect(res.status).toBe(200);
      expect(searchService.searchCharacters).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['tag1', 'tag2'],
        })
      );
    });

    it('should pass dateFrom and dateTo filters to searchCharacters', async () => {
      const { searchService } = await import('../services/search.service');
      const { messageRepository } = await import('../../db/repositories/message.repository');
      const { worldBookEntryRepository } = await import('../../db/repositories/worldbook-entry.repository');
      const { cacheService } = await import('../services/cache.service');

      vi.mocked(cacheService.get).mockResolvedValue(null);
      vi.mocked(searchService.searchCharacters).mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      });
      vi.mocked(messageRepository.searchGlobal).mockResolvedValue([]);
      vi.mocked(worldBookEntryRepository.searchByUser).mockResolvedValue([]);

      const res = await app.request('/api/v1/search?q=test&dateFrom=2024-01-01&dateTo=2024-12-31');

      expect(res.status).toBe(200);
      expect(searchService.searchCharacters).toHaveBeenCalledWith(
        expect.objectContaining({
          dateFrom: '2024-01-01',
          dateTo: '2024-12-31',
        })
      );
    });

    it('should return 400 for empty query (q missing)', async () => {
      const res = await app.request('/api/v1/search');

      expect(res.status).toBe(400);
    });

    it('should return 400 for query that is too short', async () => {
      const res = await app.request('/api/v1/search?q=');

      expect(res.status).toBe(400);
    });

    it('should return cached results when available', async () => {
      const { cacheService } = await import('../services/cache.service');

      const cachedData = {
        characters: [{ id: 'char-1', name: 'Cached' }],
        messages: [],
        worldbooks: [],
        total: 1,
      };

      vi.mocked(cacheService.get).mockResolvedValue(cachedData);

      const res = await app.request('/api/v1/search?q=test');

      expect(res.status).toBe(200);
      expect(res.headers.get('X-Cache')).toBe('HIT');
      const data = await res.json();
      expect(data.data).toEqual(cachedData);
    });
  });

  describe('GET /api/v1/search/suggestions', () => {
    it('should return character suggestions', async () => {
      const res = await app.request('/api/v1/search/suggestions?q=test');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.characters).toBeDefined();
      expect(data.data.recentSearches).toBeDefined();
    });

    it('should return 400 for missing query parameter', async () => {
      const res = await app.request('/api/v1/search/suggestions');

      expect(res.status).toBe(400);
    });

    it('should return 400 for empty query parameter', async () => {
      const res = await app.request('/api/v1/search/suggestions?q=');

      expect(res.status).toBe(400);
    });
  });
});
