/**
 * Character version diff endpoint tests
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
  eventBus: { emit: vi.fn() },
}));

vi.mock('../services/notification.service', () => ({
  notificationService: { notify: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../db/repositories/worldbook.repository', () => ({
  worldBookRepository: { create: vi.fn() },
}));
vi.mock('../../db/repositories/worldbook-entry.repository', () => ({
  worldBookEntryRepository: { create: vi.fn() },
}));
vi.mock('../../db/repositories/favorite.repository', () => ({
  favoriteRepository: { countByUser: vi.fn() },
}));

vi.mock('../../db/repositories/character.repository', () => ({
  characterRepository: {
    update: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    bulkDelete: vi.fn(),
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
  userRepository: { findById: vi.fn() },
}));

vi.mock('../../db/repositories/subscription.repository', () => ({
  subscriptionRepository: { findByTenantId: vi.fn() },
}));

vi.mock('../../db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../../db/schema/characters', () => ({ characters: {} }));
vi.mock('../../db/schema/character-collaborators', () => ({ characterCollaborators: {} }));

describe('Character Version Diff', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/characters', characterRoutes);
    app.onError(errorHandler);
    vi.clearAllMocks();
  });

  async function setupAuth(userId = 'user-owner') {
    const { verifyAccessToken } = await import('../../core/jwt');
    const { userRepository } = await import('../../db/repositories/user.repository');

    vi.mocked(verifyAccessToken).mockResolvedValue({
      userId,
      tenantId: 'tenant-1',
      email: 'test@example.com',
    });
    vi.mocked(userRepository.findById).mockResolvedValue({
      id: userId,
      tenantId: 'tenant-1',
      email: 'test@example.com',
      isActive: true,
    } as any);

    const { db } = await import('../../db');
    vi.mocked(db.select).mockReturnThis();
    vi.mocked((db as any).from).mockReturnThis();
    vi.mocked((db as any).where).mockReturnThis();
    vi.mocked((db as any).limit).mockResolvedValue([]);
  }
/* APPEND_MARKER_3 */

  describe('GET /:id/versions/:fromVersion/diff/:toVersion', () => {
    it('returns diff between two versions with correct change types', async () => {
      await setupAuth('user-owner');
      const { characterVersionService } = await import('../services/character-version.service');

      vi.mocked(characterService.getById).mockResolvedValue({
        id: 'char-1',
        creatorId: 'user-owner',
      } as any);

      vi.mocked(characterVersionService.getVersion)
        .mockResolvedValueOnce({
          version: 1,
          createdAt: '2026-01-01T00:00:00Z',
          changeNote: 'initial',
          cardData: { personality: 'brave', scenario: 'forest' },
        } as any)
        .mockResolvedValueOnce({
          version: 2,
          createdAt: '2026-01-02T00:00:00Z',
          changeNote: 'update',
          cardData: { personality: 'bold', description: 'a hero' },
        } as any);

      const res = await app.request(
        '/api/v1/characters/char-1/versions/1/diff/2',
        { headers: { Authorization: 'Bearer token' } },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.fromVersion.version).toBe(1);
      expect(body.data.toVersion.version).toBe(2);

      const changes = body.data.changes as Array<{ field: string; type: string }>;
      const personalityChange = changes.find((c) => c.field === 'personality');
      expect(personalityChange?.type).toBe('changed');

      const scenarioChange = changes.find((c) => c.field === 'scenario');
      expect(scenarioChange?.type).toBe('removed');

      const descChange = changes.find((c) => c.field === 'description');
      expect(descChange?.type).toBe('added');
    });

    it('returns 404 for non-existent version', async () => {
      await setupAuth('user-owner');
      const { characterVersionService } = await import('../services/character-version.service');

      vi.mocked(characterService.getById).mockResolvedValue({
        id: 'char-1',
        creatorId: 'user-owner',
      } as any);

      vi.mocked(characterVersionService.getVersion)
        .mockResolvedValueOnce(null as any)
        .mockResolvedValueOnce({
          version: 2,
          createdAt: '2026-01-02T00:00:00Z',
          cardData: {},
        } as any);

      const res = await app.request(
        '/api/v1/characters/char-1/versions/99/diff/2',
        { headers: { Authorization: 'Bearer token' } },
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});
