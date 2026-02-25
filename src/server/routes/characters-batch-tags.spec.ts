/**
 * Batch tags endpoint tests
 *
 * Verifies POST /batch-tags adds/removes tags on owned characters
 * and returns 403 when characters are not owned by the caller.
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
    getCachedSearch: vi.fn().mockResolvedValue(null),
    setCachedSearch: vi.fn().mockResolvedValue(undefined),
    getCachedMarketplace: vi.fn().mockResolvedValue(null),
    setCachedMarketplace: vi.fn().mockResolvedValue(undefined),
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
    bulkDelete: vi.fn().mockResolvedValue(0),
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
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}));

describe('POST /api/v1/characters/batch-tags', () => {
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

  it('should return 200 with updated count when adding tags', async () => {
    await setupAuth();
    const { db } = await import('../../db');

    const ids = [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ];

    // Mock ownership check — return both characters as owned
    const mockWhere = vi.fn().mockResolvedValue(
      ids.map(id => ({ id, tags: ['existing'] })),
    );
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({ where: mockWhere }),
    } as any);

    // Mock update
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    } as any);

    const res = await app.request('/api/v1/characters/batch-tags', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      },
      body: JSON.stringify({
        characterIds: ids,
        addTags: ['new-tag'],
        removeTags: [],
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.updatedCount).toBe(2);
  });

  it('should return 403 when character not owned', async () => {
    await setupAuth();
    const { db } = await import('../../db');

    const ids = [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ];

    // Mock ownership check — return only 1 of 2 (not all owned)
    const mockWhere = vi.fn().mockResolvedValue([
      { id: ids[0], tags: [] },
    ]);
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({ where: mockWhere }),
    } as any);

    const res = await app.request('/api/v1/characters/batch-tags', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      },
      body: JSON.stringify({
        characterIds: ids,
        addTags: ['tag1'],
        removeTags: [],
      }),
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('FORBIDDEN');
  });
});
