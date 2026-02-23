/**
 * Character Duplicate endpoint tests
 *
 * Verifies that POST /:id/duplicate creates a copy of a character
 * with "(Copy)" suffix, sets isPublic to false, and handles not-found.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { characterRoutes } from './characters';
import { characterService } from '../services/character.service';
import { errorHandler } from '../middleware/error-handler';

vi.mock('../services/character.service');
vi.mock('../services/search.service');
vi.mock('../services/rating.service');
vi.mock('../services/character-version.service', () => ({
  characterVersionService: {
    listVersions: vi.fn(),
    getVersion: vi.fn(),
    saveVersion: vi.fn(),
  },
}));
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
vi.mock('../services/notification.service', () => ({
  notificationService: {
    notify: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../../db/repositories/character.repository', () => ({
  characterRepository: {
    create: vi.fn(),
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

vi.mock('../../db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../../db/schema/characters', () => ({
  characters: {},
}));

vi.mock('../../db/schema/character-collaborators', () => ({
  characterCollaborators: {},
}));

describe('Character Duplicate Endpoint', () => {
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

  const mockOriginal = {
    id: 'char-original',
    tenantId: 'tenant-123',
    creatorId: 'user-123',
    name: 'My Character',
    description: 'A cool character',
    avatarUrl: 'https://example.com/avatar.png',
    cardData: { personality: 'friendly' },
    tags: ['fantasy', 'rpg'],
    category: 'adventure',
    isPublic: true,
    isNsfw: false,
    downloadCount: 42,
    viewCount: 100,
    ratingAvg: '4.5',
    ratingCount: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('POST /api/v1/characters/:id/duplicate', () => {
    it('should create a duplicate with "(Copy)" suffix in name', async () => {
      await setupAuth();
      const { characterRepository } = await import('../../db/repositories/character.repository');

      vi.mocked(characterService.getById).mockResolvedValue(mockOriginal as any);

      const mockDuplicate = {
        ...mockOriginal,
        id: 'char-duplicate',
        name: 'My Character (Copy)',
        isPublic: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(characterRepository.create).mockResolvedValue(mockDuplicate as any);

      const res = await app.request('/api/v1/characters/char-original/duplicate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer token' },
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('My Character (Copy)');

      expect(characterRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My Character (Copy)',
          tenantId: 'tenant-123',
          creatorId: 'user-123',
          description: 'A cool character',
          avatarUrl: 'https://example.com/avatar.png',
          cardData: { personality: 'friendly' },
          tags: ['fantasy', 'rpg'],
          category: 'adventure',
        }),
      );
    });

    it('should set isPublic to false on the duplicate', async () => {
      await setupAuth();
      const { characterRepository } = await import('../../db/repositories/character.repository');

      vi.mocked(characterService.getById).mockResolvedValue(mockOriginal as any);

      const mockDuplicate = {
        ...mockOriginal,
        id: 'char-duplicate',
        name: 'My Character (Copy)',
        isPublic: false,
      };
      vi.mocked(characterRepository.create).mockResolvedValue(mockDuplicate as any);

      const res = await app.request('/api/v1/characters/char-original/duplicate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer token' },
      });

      expect(res.status).toBe(201);

      expect(characterRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isPublic: false,
        }),
      );
    });

    it('should return 404 for non-existent character', async () => {
      await setupAuth();

      const { NotFoundError } = await import('../../core/errors');
      vi.mocked(characterService.getById).mockRejectedValue(new NotFoundError('Character'));

      const res = await app.request('/api/v1/characters/nonexistent-id/duplicate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer token' },
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await app.request('/api/v1/characters/char-original/duplicate', {
        method: 'POST',
      });

      expect(res.status).toBe(401);
    });
  });
});
