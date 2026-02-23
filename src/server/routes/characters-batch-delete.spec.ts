/**
 * Batch delete endpoint tests
 *
 * Verifies POST /batch-delete validates input, calls bulkDelete with
 * the correct tenantId, invalidates caches, and returns the deleted count.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { characterRoutes } from './characters';
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
  eventBus: { emit: vi.fn() },
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
    bulkDelete: vi.fn().mockResolvedValue(3),
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

vi.mock('../services/character-version.service', () => ({
  characterVersionService: {
    saveVersion: vi.fn().mockResolvedValue(undefined),
    listVersions: vi.fn().mockResolvedValue([]),
    getVersion: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

describe('POST /api/v1/characters/batch-delete', () => {
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

  it('should return count of deleted characters', async () => {
    await setupAuth();
    const { characterRepository } = await import('../../db/repositories/character.repository');
    const { cacheService } = await import('../services/cache.service');

    vi.mocked(characterRepository.bulkDelete).mockResolvedValue(3);

    const ids = [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
    ];

    const res = await app.request('/api/v1/characters/batch-delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      },
      body: JSON.stringify({ characterIds: ids }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.deleted).toBe(3);
    expect(cacheService.invalidateCharacter).toHaveBeenCalledTimes(3);
  });

  it('should call bulkDelete with correct tenantId', async () => {
    await setupAuth();
    const { characterRepository } = await import('../../db/repositories/character.repository');

    vi.mocked(characterRepository.bulkDelete).mockResolvedValue(1);

    const ids = ['11111111-1111-1111-1111-111111111111'];

    await app.request('/api/v1/characters/batch-delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      },
      body: JSON.stringify({ characterIds: ids }),
    });

    expect(characterRepository.bulkDelete).toHaveBeenCalledWith(ids, 'tenant-123');
  });

  it('should return 400 for empty array', async () => {
    await setupAuth();

    const res = await app.request('/api/v1/characters/batch-delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      },
      body: JSON.stringify({ characterIds: [] }),
    });

    expect(res.status).toBe(400);
  });

  it('should return 400 for more than 50 IDs', async () => {
    await setupAuth();

    const ids = Array.from({ length: 51 }, (_, i) =>
      `${String(i).padStart(8, '0')}-0000-0000-0000-000000000000`
    );

    const res = await app.request('/api/v1/characters/batch-delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      },
      body: JSON.stringify({ characterIds: ids }),
    });

    expect(res.status).toBe(400);
  });

  it('should require authentication', async () => {
    const res = await app.request('/api/v1/characters/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        characterIds: ['11111111-1111-1111-1111-111111111111'],
      }),
    });

    expect(res.status).toBe(401);
  });
});
