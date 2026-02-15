/**
 * FavoriteRepository unit tests (mocked DB)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb, mockTx } = vi.hoisted(() => {
  function createChain() {
    const c: any = {};
    c.insert = vi.fn(() => c);
    c.values = vi.fn(() => c);
    c.returning = vi.fn();
    c.select = vi.fn(() => c);
    c.from = vi.fn(() => c);
    c.where = vi.fn(() => c);
    c.update = vi.fn(() => c);
    c.set = vi.fn(() => c);
    c.delete = vi.fn(() => c);
    c.innerJoin = vi.fn(() => c);
    c.orderBy = vi.fn(() => c);
    c.limit = vi.fn(() => c);
    c.offset = vi.fn();
    c.onConflictDoNothing = vi.fn(() => c);
    return c;
  }
  const mockTx = createChain();
  const mockDb = createChain();
  mockDb.transaction = vi.fn(async (fn: any) => fn(mockTx));
  return { mockDb, mockTx };
});

vi.mock('../index', () => ({ db: mockDb }));

vi.mock('../schema/social', () => ({
  favorites: {
    id: 'id', userId: 'user_id', characterId: 'character_id', createdAt: 'created_at',
  },
}));

vi.mock('../schema/characters', () => ({
  characters: {
    id: 'id', name: 'name', avatarUrl: 'avatar_url',
    description: 'description', favoriteCount: 'favorite_count',
  },
}));

import { FavoriteRepository } from './favorite.repository';

function resetChain(c: any) {
  c.insert.mockImplementation(() => c);
  c.values.mockImplementation(() => c);
  c.select.mockImplementation(() => c);
  c.from.mockImplementation(() => c);
  c.where.mockImplementation(() => c);
  c.update.mockImplementation(() => c);
  c.set.mockImplementation(() => c);
  c.delete.mockImplementation(() => c);
  c.innerJoin.mockImplementation(() => c);
  c.orderBy.mockImplementation(() => c);
  c.limit.mockImplementation(() => c);
  c.onConflictDoNothing.mockImplementation(() => c);
}

describe('FavoriteRepository', () => {
  let repository: FavoriteRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    resetChain(mockDb);
    resetChain(mockTx);
    mockDb.transaction.mockImplementation(async (fn: any) => fn(mockTx));
    repository = new FavoriteRepository(mockDb as any);
  });

  describe('favorite()', () => {
    it('should insert a favorite record via transaction', async () => {
      const fakeFav = { id: 'fav-1', userId: 'u-1', characterId: 'ch-1', createdAt: new Date() };
      // onConflictDoNothing -> returning -> [row] means new insert
      mockTx.returning.mockResolvedValueOnce([fakeFav]);

      const result = await repository.favorite('u-1', 'ch-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('fav-1');
      expect(result.userId).toBe('u-1');
      expect(result.characterId).toBe('ch-1');
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should be idempotent on duplicate favorite', async () => {
      // returning undefined means conflict (already exists)
      mockTx.returning.mockResolvedValueOnce([undefined]);
      // Then it selects the existing record
      const existing = { id: 'fav-1', userId: 'u-1', characterId: 'ch-1', createdAt: new Date() };
      mockTx.where.mockResolvedValueOnce([existing]);

      const result = await repository.favorite('u-1', 'ch-1');

      expect(result.id).toBe('fav-1');
    });
  });

  describe('unfavorite()', () => {
    it('should delete the favorite record via transaction', async () => {
      mockTx.returning.mockResolvedValueOnce([{ id: 'fav-1' }]);

      const result = await repository.unfavorite('u-1', 'ch-1');

      expect(result).toBe(true);
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should return false when favorite does not exist', async () => {
      mockTx.returning.mockResolvedValueOnce([]);

      const result = await repository.unfavorite('u-1', 'ch-1');
      expect(result).toBe(false);
    });
  });

  describe('isFavorited()', () => {
    it('should return true when favorited', async () => {
      mockDb.where.mockResolvedValueOnce([{ id: 'fav-1' }]);

      const result = await repository.isFavorited('u-1', 'ch-1');
      expect(result).toBe(true);
    });

    it('should return false when not favorited', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await repository.isFavorited('u-1', 'ch-1');
      expect(result).toBe(false);
    });
  });

  describe('getFavoritesByUser()', () => {
    it('should return paginated list with character info', async () => {
      const rows = [
        { id: 'ch-1', name: 'Test Character', avatarUrl: null, description: 'desc', favoritedAt: new Date() },
        { id: 'ch-2', name: 'Second Character', avatarUrl: null, description: 'desc2', favoritedAt: new Date() },
      ];
      mockDb.offset.mockResolvedValueOnce(rows);

      const all = await repository.getFavoritesByUser('u-1', 10, 0);

      expect(all).toHaveLength(2);
      expect(all[0].name).toBe('Test Character');
      expect(all[1].name).toBe('Second Character');
    });

    it('should return empty array when user has no favorites', async () => {
      mockDb.offset.mockResolvedValueOnce([]);

      const result = await repository.getFavoritesByUser('u-1', 10, 0);
      expect(result).toHaveLength(0);
    });
  });

  describe('getFavoriteCount()', () => {
    it('should return the favorite count from characters table', async () => {
      mockDb.where.mockResolvedValueOnce([{ favoriteCount: 1 }]);

      const count = await repository.getFavoriteCount('ch-1');
      expect(count).toBe(1);
    });

    it('should return 0 for non-existent character', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const count = await repository.getFavoriteCount('00000000-0000-0000-0000-000000000000');
      expect(count).toBe(0);
    });
  });
});
