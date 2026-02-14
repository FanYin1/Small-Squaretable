/**
 * Character Stats endpoint tests
 *
 * Verifies that GET /stats returns the real favorites count
 * from the favorite repository instead of a hardcoded 0.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { characterRoutes } from './characters';
import { characterService } from '../services/character.service';
import { errorHandler } from '../middleware/error-handler';

vi.mock('../services/character.service');
vi.mock('../services/search.service');
vi.mock('../services/rating.service');
vi.mock('../services/cache.service', () => ({
  cacheService: {
    invalidateCharacter: vi.fn().mockResolvedValue(undefined),
    invalidateMarketplace: vi.fn().mockResolvedValue(undefined),
    getCachedCharacter: vi.fn().mockResolvedValue(null),
    setCachedCharacter: vi.fn().mockResolvedValue(undefined),
    getCachedMarketplace: vi.fn().mockResolvedValue(null),
    setCachedMarketplace: vi.fn().mockResolvedValue(undefined),
    getCachedSearch: vi.fn().mockResolvedValue(null),
    setCachedSearch: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../services/event-bus.service', () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));

vi.mock('../../db/repositories/worldbook.repository', () => ({
  worldBookRepository: {
    create: vi.fn(),
  },
}));
vi.mock('../../db/repositories/worldbook-entry.repository', () => ({
  worldBookEntryRepository: {
    create: vi.fn(),
  },
}));

vi.mock('../../db/repositories/favorite.repository', () => ({
  favoriteRepository: {
    countByUser: vi.fn(),
  },
}));

vi.mock('../../core/jwt', () => ({
  verifyAccessToken: vi.fn(),
  extractTokenFromHeader: vi.fn((header) => {
    if (!header || !header.startsWith('Bearer ')) return null;
    return header.slice(7);
  }),
}));

vi.mock('../../db/repositories/user.repository', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('../../db/repositories/subscription.repository', () => ({
  subscriptionRepository: {
    findByTenantId: vi.fn(),
  },
}));

describe('Character Stats Endpoint', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/characters', characterRoutes);
    app.onError(errorHandler);
    vi.clearAllMocks();
  });

  async function setupAuth() {
    const { verifyAccessToken } = await import('../../core/jwt');
    const { userRepository } = await import('../../db/repositories/user.repository');

    vi.mocked(verifyAccessToken).mockResolvedValue({
      userId: 'user-123',
      tenantId: 'tenant-123',
      email: 'test@example.com',
    });
    vi.mocked(userRepository.findById).mockResolvedValue({
      id: 'user-123',
      tenantId: 'tenant-123',
      email: 'test@example.com',
      isActive: true,
    } as any);
  }

  describe('GET /api/v1/characters/stats', () => {
    it('should return the real favorites count from the repository', async () => {
      await setupAuth();
      const { favoriteRepository } = await import('../../db/repositories/favorite.repository');

      const mockResponse = {
        items: [],
        pagination: {
          page: 1,
          limit: 1000,
          total: 5,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };

      vi.mocked(characterService.getByTenantId).mockResolvedValue(mockResponse as any);
      vi.mocked(favoriteRepository.countByUser).mockResolvedValue(7);

      const res = await app.request('/api/v1/characters/stats', {
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.total).toBe(5);
      expect(data.data.favorites).toBe(7);
      expect(favoriteRepository.countByUser).toHaveBeenCalledWith('user-123');
    });

    it('should return 0 favorites when user has no favorites', async () => {
      await setupAuth();
      const { favoriteRepository } = await import('../../db/repositories/favorite.repository');

      const mockResponse = {
        items: [],
        pagination: {
          page: 1,
          limit: 1000,
          total: 3,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };

      vi.mocked(characterService.getByTenantId).mockResolvedValue(mockResponse as any);
      vi.mocked(favoriteRepository.countByUser).mockResolvedValue(0);

      const res = await app.request('/api/v1/characters/stats', {
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.total).toBe(3);
      expect(data.data.favorites).toBe(0);
      expect(favoriteRepository.countByUser).toHaveBeenCalledWith('user-123');
    });

    it('should require authentication', async () => {
      const res = await app.request('/api/v1/characters/stats');

      expect(res.status).toBe(401);
    });
  });
});
