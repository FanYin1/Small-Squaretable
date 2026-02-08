/**
 * FollowRepository Unit Tests
 *
 * Uses mocked database since no real DB connection is available.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Database } from '../index';
import { FollowRepository } from './follow.repository';

// ── Helpers ──

const mockFollowRecord = {
  id: 'follow-uuid-1',
  followerId: 'user-a',
  followingId: 'user-b',
  createdAt: new Date('2026-02-09T00:00:00Z'),
};

/**
 * Build a chainable query-builder mock.
 * Each method returns `this` so calls like
 *   db.select().from().where().orderBy().limit().offset()
 * resolve correctly.
 */
function createChainMock(resolvedValue: unknown = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const self = () => chain;

  chain.select = vi.fn().mockReturnValue(self());
  chain.from = vi.fn().mockReturnValue(self());
  chain.where = vi.fn().mockReturnValue(self());
  chain.innerJoin = vi.fn().mockReturnValue(self());
  chain.orderBy = vi.fn().mockReturnValue(self());
  chain.limit = vi.fn().mockReturnValue(self());
  chain.offset = vi.fn().mockReturnValue(self());
  chain.insert = vi.fn().mockReturnValue(self());
  chain.values = vi.fn().mockReturnValue(self());
  chain.onConflictDoNothing = vi.fn().mockReturnValue(self());
  chain.returning = vi.fn().mockResolvedValue(resolvedValue);
  chain.delete = vi.fn().mockReturnValue(self());
  chain.update = vi.fn().mockReturnValue(self());
  chain.set = vi.fn().mockReturnValue(self());

  // Make the chain itself thenable so `await chain` resolves to resolvedValue
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

describe('FollowRepository', () => {
  let repository: FollowRepository;
  let mockDb: Record<string, unknown>;

  beforeEach(() => {
    mockDb = {};
    repository = new FollowRepository(mockDb as unknown as Database);
  });

  // ── follow() ──

  describe('follow', () => {
    it('should call db.transaction and return the new follow record', async () => {
      // Simulate transaction: the callback receives a `tx` object.
      // We make `tx` a chain mock that returns the new row on `.returning()`.
      mockDb.transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = createChainMock([mockFollowRecord]);
        return cb(tx);
      });

      const result = await repository.follow('user-a', 'user-b');

      expect(mockDb.transaction).toHaveBeenCalledOnce();
      expect(result).toEqual(mockFollowRecord);
    });

    it('should return existing record on duplicate (conflict)', async () => {
      const existingRecord = { ...mockFollowRecord, id: 'existing-uuid' };

      mockDb.transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
        // First returning() call returns [] (conflict, no row inserted)
        // Then select().from().where() resolves to [existingRecord]
        const tx = createChainMock([]);
        // Override: after the first returning() returns [], the select chain
        // should resolve to [existingRecord].
        let returningCallCount = 0;
        tx.returning = vi.fn().mockImplementation(() => {
          returningCallCount++;
          if (returningCallCount === 1) {
            // insert ... returning → empty (conflict)
            return Promise.resolve([]);
          }
          // subsequent returning calls (update counters) — not reached in conflict path
          return Promise.resolve([]);
        });

        // The select chain (for fetching existing) should resolve to [existingRecord]
        // Override `then` so that awaiting the chain after .where() gives [existingRecord]
        const selectChain = createChainMock([existingRecord]);
        tx.select = vi.fn().mockReturnValue(selectChain);

        return cb(tx);
      });

      const result = await repository.follow('user-a', 'user-b');

      expect(result).toEqual(existingRecord);
    });
  });

  // ── unfollow() ──

  describe('unfollow', () => {
    it('should delete record and decrement counters, returning true', async () => {
      mockDb.transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = createChainMock([mockFollowRecord]);
        return cb(tx);
      });

      const result = await repository.unfollow('user-a', 'user-b');

      expect(mockDb.transaction).toHaveBeenCalledOnce();
      expect(result).toBe(true);
    });

    it('should return false when follow record does not exist', async () => {
      mockDb.transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = createChainMock([]);
        // delete().where().returning() → [] means nothing was deleted
        return cb(tx);
      });

      const result = await repository.unfollow('user-a', 'user-b');

      expect(result).toBe(false);
    });
  });

  // ── isFollowing() ──

  describe('isFollowing', () => {
    it('should return true when a follow record exists', async () => {
      const chain = createChainMock([{ id: 'follow-uuid-1' }]);
      mockDb.select = chain.select;

      const result = await repository.isFollowing('user-a', 'user-b');

      expect(result).toBe(true);
    });

    it('should return false when no follow record exists', async () => {
      const chain = createChainMock([]);
      mockDb.select = chain.select;

      const result = await repository.isFollowing('user-a', 'user-b');

      expect(result).toBe(false);
    });
  });

  // ── getFollowers() ──

  describe('getFollowers', () => {
    it('should return paginated list with user info', async () => {
      const followerRows = [
        {
          id: 'user-c',
          displayName: 'Charlie',
          avatarUrl: 'https://example.com/charlie.png',
          followedAt: new Date('2026-02-08T00:00:00Z'),
        },
        {
          id: 'user-d',
          displayName: null,
          avatarUrl: null,
          followedAt: new Date('2026-02-07T00:00:00Z'),
        },
      ];

      const chain = createChainMock(followerRows);
      mockDb.select = chain.select;

      const result = await repository.getFollowers('user-b', 10, 0);

      expect(result).toEqual(followerRows);
      expect(result).toHaveLength(2);
      expect(chain.innerJoin).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(10);
      expect(chain.offset).toHaveBeenCalledWith(0);
    });
  });

  // ── getFollowing() ──

  describe('getFollowing', () => {
    it('should return paginated list with user info', async () => {
      const followingRows = [
        {
          id: 'user-e',
          displayName: 'Eve',
          avatarUrl: 'https://example.com/eve.png',
          followedAt: new Date('2026-02-09T00:00:00Z'),
        },
      ];

      const chain = createChainMock(followingRows);
      mockDb.select = chain.select;

      const result = await repository.getFollowing('user-a', 20, 5);

      expect(result).toEqual(followingRows);
      expect(result).toHaveLength(1);
      expect(chain.innerJoin).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(20);
      expect(chain.offset).toHaveBeenCalledWith(5);
    });
  });

  // ── getFollowCounts() ──

  describe('getFollowCounts', () => {
    it('should return followerCount and followingCount from user record', async () => {
      const chain = createChainMock([{ followerCount: 42, followingCount: 7 }]);
      mockDb.select = chain.select;

      const result = await repository.getFollowCounts('user-a');

      expect(result).toEqual({ followerCount: 42, followingCount: 7 });
    });

    it('should return zeros when user is not found', async () => {
      const chain = createChainMock([]);
      mockDb.select = chain.select;

      const result = await repository.getFollowCounts('nonexistent-user');

      expect(result).toEqual({ followerCount: 0, followingCount: 0 });
    });
  });
});


