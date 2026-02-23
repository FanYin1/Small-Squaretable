/**
 * Character version endpoint tenant isolation tests
 *
 * Verifies that version endpoints enforce ownership / collaborator access.
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

// Chain-style db mock — each method returns `this` so
// db.select().from().where().limit() resolves to the value set on `limit`.
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

describe('Character Version Tenant Isolation', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/characters', characterRoutes);
    app.onError(errorHandler);
    vi.clearAllMocks();
  });

  /** Reset the db chain mock so limit returns [] by default. */
  async function resetDbMock() {
    const { db } = await import('../../db');
    vi.mocked(db.select).mockReturnThis();
    vi.mocked((db as any).from).mockReturnThis();
    vi.mocked((db as any).where).mockReturnThis();
    vi.mocked((db as any).limit).mockResolvedValue([]);
  }

  /** Set up JWT + user repo so authMiddleware passes. */
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

    await resetDbMock();
  }

  // ── List versions ──

  describe('GET /:id/versions', () => {
    it('returns versions for the character owner', async () => {
      await setupAuth('user-owner');
      const { characterVersionService } = await import('../services/character-version.service');

      // getById returns character owned by user-owner
      vi.mocked(characterService.getById).mockResolvedValue({
        id: 'char-1',
        creatorId: 'user-owner',
      } as any);

      const mockVersions = [{ id: 'v1', version: 1 }];
      vi.mocked(characterVersionService.listVersions).mockResolvedValue(mockVersions as any);

      const res = await app.request('/api/v1/characters/char-1/versions', {
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockVersions);
    });

    it('returns 403 for non-owner non-collaborator', async () => {
      await setupAuth('user-other');

      // Character belongs to someone else
      vi.mocked(characterService.getById).mockResolvedValue({
        id: 'char-1',
        creatorId: 'user-owner',
      } as any);

      const res = await app.request('/api/v1/characters/char-1/versions', {
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  // ── Restore version ──

  describe('POST /:id/versions/:version/restore', () => {
    it('returns 403 for non-owner', async () => {
      await setupAuth('user-other');

      vi.mocked(characterService.getById).mockResolvedValue({
        id: 'char-1',
        creatorId: 'user-owner',
      } as any);

      const res = await app.request('/api/v1/characters/char-1/versions/1/restore', {
        method: 'POST',
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  // ── Save version (collaborator) ──

  describe('POST /:id/versions', () => {
    it('allows a collaborator to save a version', async () => {
      await setupAuth('user-collab');
      const { characterVersionService } = await import('../services/character-version.service');
      const { db } = await import('../../db');

      // Character belongs to someone else
      vi.mocked(characterService.getById).mockResolvedValue({
        id: 'char-1',
        creatorId: 'user-owner',
        cardData: { personality: 'brave' },
      } as any);

      // Collaborator lookup returns a match
      vi.mocked((db as any).limit).mockResolvedValue([{ userId: 'user-collab', role: 'editor' }]);

      vi.mocked(characterVersionService.saveVersion).mockResolvedValue({
        id: 'ver-1',
        version: 1,
      } as any);

      const res = await app.request('/api/v1/characters/char-1/versions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ changeNote: 'test save' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(characterVersionService.saveVersion).toHaveBeenCalled();
    });
  });
});
