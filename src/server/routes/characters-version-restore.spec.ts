/**
 * Version restore + JSON export endpoint tests
 *
 * Task A: POST /:id/versions/:version/restore
 * Task B: GET /:id/export/json
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

describe('Character Version Restore & JSON Export', () => {
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

  // ── Version Restore Tests ──

  describe('POST /api/v1/characters/:id/versions/:version/restore', () => {
    it('should restore and return success with version number', async () => {
      await setupAuth();
      const { characterVersionService } = await import('../services/character-version.service');
      const { characterRepository } = await import('../../db/repositories/character.repository');
      const { cacheService } = await import('../services/cache.service');

      vi.mocked(characterVersionService.getVersion).mockResolvedValue({
        id: 'ver-1',
        characterId: 'char-1',
        version: 3,
        cardData: { personality: 'brave' },
        createdAt: new Date(),
      } as any);

      vi.mocked(characterService.getById).mockResolvedValue({
        id: 'char-1',
        creatorId: 'user-123',
        cardData: { personality: 'current' },
      } as any);

      vi.mocked(characterVersionService.saveVersion).mockResolvedValue(undefined as any);
      vi.mocked(characterRepository.update).mockResolvedValue(undefined as any);

      const res = await app.request('/api/v1/characters/char-1/versions/3/restore', {
        method: 'POST',
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.restored).toBe(true);
      expect(data.data.version).toBe(3);
      expect(cacheService.invalidateCharacter).toHaveBeenCalledWith('char-1');
    });

    it('should return 404 for non-existent version', async () => {
      await setupAuth();
      const { characterVersionService } = await import('../services/character-version.service');

      vi.mocked(characterService.getById).mockResolvedValue({
        id: 'char-1',
        creatorId: 'user-123',
      } as any);
      vi.mocked(characterVersionService.getVersion).mockResolvedValue(null);

      const res = await app.request('/api/v1/characters/char-1/versions/999/restore', {
        method: 'POST',
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('should auto-save current state before restoring', async () => {
      await setupAuth();
      const { characterVersionService } = await import('../services/character-version.service');
      const { characterRepository } = await import('../../db/repositories/character.repository');

      vi.mocked(characterVersionService.getVersion).mockResolvedValue({
        id: 'ver-1',
        characterId: 'char-1',
        version: 2,
        cardData: { personality: 'old' },
        createdAt: new Date(),
      } as any);

      vi.mocked(characterService.getById).mockResolvedValue({
        id: 'char-1',
        creatorId: 'user-123',
        cardData: { personality: 'current-state' },
      } as any);

      vi.mocked(characterVersionService.saveVersion).mockResolvedValue(undefined as any);
      vi.mocked(characterRepository.update).mockResolvedValue(undefined as any);

      await app.request('/api/v1/characters/char-1/versions/2/restore', {
        method: 'POST',
        headers: { Authorization: 'Bearer token' },
      });

      expect(characterVersionService.saveVersion).toHaveBeenCalledWith(
        'char-1',
        { personality: 'current-state' },
        'user-123',
        'Auto-save before restore to v2',
      );
    });
  });

  // ── JSON Export Tests ──

  describe('GET /api/v1/characters/:id/export/json', () => {
    it('should return JSON with correct Content-Type and Content-Disposition headers', async () => {
      await setupAuth();

      vi.mocked(characterService.getById).mockResolvedValue({
        id: 'char-1',
        name: 'Test Character',
        description: 'A test',
        tags: ['fantasy'],
        cardData: { personality: 'friendly' },
      } as any);

      const res = await app.request('/api/v1/characters/char-1/export/json', {
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/json');
      expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="Test_Character.json"');
    });

    it('should return character card data with spec fields', async () => {
      await setupAuth();

      vi.mocked(characterService.getById).mockResolvedValue({
        id: 'char-1',
        name: 'My Hero',
        description: 'Brave warrior',
        tags: ['action', 'rpg'],
        cardData: { personality: 'bold', scenario: 'dungeon' },
      } as any);

      const res = await app.request('/api/v1/characters/char-1/export/json', {
        headers: { Authorization: 'Bearer token' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('My Hero');
      expect(body.description).toBe('Brave warrior');
      expect(body.tags).toEqual(['action', 'rpg']);
      expect(body.personality).toBe('bold');
      expect(body.scenario).toBe('dungeon');
      expect(body.spec).toBe('chara_card_v2');
      expect(body.spec_version).toBe('2.0');
    });
  });
});
