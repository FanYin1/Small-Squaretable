/**
 * Character PATCH /:id endpoint tests
 *
 * Verifies tenant isolation and field restriction for collaborator edits.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { characterRoutes } from './characters';
import { characterService } from '../services/character.service';
import { errorHandler } from '../middleware/error-handler';

vi.mock('../services/character.service');
vi.mock('../services/character-version.service', () => ({
  characterVersionService: {
    saveVersion: vi.fn().mockResolvedValue(undefined),
  },
}));
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
vi.mock('../services/notification.service', () => ({
  notificationService: {
    create: vi.fn().mockResolvedValue(undefined),
  },
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
  characterRepository: {},
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

// Mock the db module for collaborator queries
const mockLimit = vi.fn();
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

const mockReturning = vi.fn();
const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockReturning });
const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
const mockDbUpdate = vi.fn().mockReturnValue({ set: mockSet });

vi.mock('../../db', () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
  },
}));

vi.mock('../../db/schema/characters', () => ({
  characters: { id: 'id', tenantId: 'tenant_id' },
}));
vi.mock('../../db/schema/character-collaborators', () => ({
  characterCollaborators: {
    characterId: 'character_id',
    userId: 'user_id',
    role: 'role',
  },
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ op: 'eq', a, b })),
  and: vi.fn((...args: any[]) => ({ op: 'and', args })),
  sql: vi.fn(),
}));

describe('PATCH /api/v1/characters/:id', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/characters', characterRoutes);
    app.onError(errorHandler);
    vi.clearAllMocks();
  });

  async function setupAuth(overrides: Record<string, any> = {}) {
    const { verifyAccessToken } = await import('../../core/jwt');
    const { userRepository } = await import('../../db/repositories/user.repository');

    const userId = overrides.userId ?? 'user-123';
    const tenantId = overrides.tenantId ?? 'tenant-123';

    vi.mocked(verifyAccessToken).mockResolvedValue({
      userId,
      tenantId,
      email: 'test@example.com',
    });
    vi.mocked(userRepository.findById).mockResolvedValue({
      id: userId,
      tenantId,
      email: 'test@example.com',
      isActive: true,
    } as any);
  }

  it('should strip isNsfw from collaborator updates', async () => {
    await setupAuth({ userId: 'collab-1', tenantId: 'tenant-123' });

    // Character owned by someone else in the same tenant
    vi.mocked(characterService.getById).mockResolvedValue({
      id: 'char-1',
      creatorId: 'owner-1',
      tenantId: 'tenant-123',
      cardData: null,
    } as any);

    // User is an editor collaborator
    mockLimit.mockResolvedValue([{ userId: 'collab-1', role: 'editor' }]);

    const updatedChar = { id: 'char-1', name: 'New Name' };
    mockReturning.mockResolvedValue([updatedChar]);

    const res = await app.request('/api/v1/characters/char-1', {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'New Name', isNsfw: true }),
    });

    expect(res.status).toBe(200);
    // Verify db.update was called with safeInput (no isNsfw)
    expect(mockSet).toHaveBeenCalledTimes(1);
    const setArg = mockSet.mock.calls[0][0];
    expect(setArg).toHaveProperty('name', 'New Name');
    expect(setArg).not.toHaveProperty('isNsfw');
    expect(setArg).toHaveProperty('updatedAt');
  });

  it('should return 403 for collaborator from a different tenant', async () => {
    await setupAuth({ userId: 'collab-cross', tenantId: 'tenant-OTHER' });

    // Character belongs to tenant-123, but user is in tenant-OTHER
    vi.mocked(characterService.getById).mockResolvedValue({
      id: 'char-1',
      creatorId: 'owner-1',
      tenantId: 'tenant-123',
      cardData: null,
    } as any);

    const res = await app.request('/api/v1/characters/char-1', {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Hacked Name' }),
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('FORBIDDEN');
    // db.update should never have been called
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('should allow owner to update all fields including isNsfw', async () => {
    await setupAuth({ userId: 'owner-1', tenantId: 'tenant-123' });

    vi.mocked(characterService.getById).mockResolvedValue({
      id: 'char-1',
      creatorId: 'owner-1',
      tenantId: 'tenant-123',
      cardData: null,
    } as any);

    const updatedChar = { id: 'char-1', name: 'Updated', isNsfw: true };
    vi.mocked(characterService.update).mockResolvedValue(updatedChar as any);

    const res = await app.request('/api/v1/characters/char-1', {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Updated', isNsfw: true }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.isNsfw).toBe(true);
    // Owner path uses characterService.update, not direct db.update
    expect(characterService.update).toHaveBeenCalledWith(
      'char-1', 'owner-1', 'tenant-123',
      expect.objectContaining({ name: 'Updated', isNsfw: true })
    );
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});
