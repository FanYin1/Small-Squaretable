import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSocialStore } from './social';

vi.mock('../services/social.api', () => ({
  socialApi: {
    getFeed: vi.fn(),
    getUserActivities: vi.fn(),
    likeComment: vi.fn(),
    unlikeComment: vi.fn(),
  },
}));

import { socialApi } from '../services/social.api';

const mockActivity = (overrides = {}) => ({
  id: 'act-1',
  userId: 'user-1',
  type: 'comment',
  targetType: 'character',
  targetId: 'char-1',
  metadata: {},
  createdAt: '2026-02-22T00:00:00.000Z',
  ...overrides,
});

describe('useSocialStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe('fetchFeed', () => {
    it('should fetch activity feed', async () => {
      const items = [mockActivity(), mockActivity({ id: 'act-2' })];
      vi.mocked(socialApi.getFeed).mockResolvedValue(items);

      const store = useSocialStore();
      await store.fetchFeed();

      expect(socialApi.getFeed).toHaveBeenCalledWith(20, 0);
      expect(store.activities).toEqual(items);
      expect(store.feedLoading).toBe(false);
      expect(store.hasMore).toBe(false);
      expect(store.error).toBeNull();
    });

    it('should set hasMore when result length equals limit', async () => {
      const items = Array.from({ length: 20 }, (_, i) => mockActivity({ id: `act-${i}` }));
      vi.mocked(socialApi.getFeed).mockResolvedValue(items);

      const store = useSocialStore();
      await store.fetchFeed(20);

      expect(store.hasMore).toBe(true);
    });
  });

  describe('fetchUserActivities', () => {
    it('should fetch user activities', async () => {
      const items = [mockActivity({ userId: 'user-2' })];
      vi.mocked(socialApi.getUserActivities).mockResolvedValue(items);

      const store = useSocialStore();
      await store.fetchUserActivities('user-2');

      expect(socialApi.getUserActivities).toHaveBeenCalledWith('user-2', 20, 0);
      expect(store.activities).toEqual(items);
      expect(store.feedLoading).toBe(false);
      expect(store.error).toBeNull();
    });
  });

  describe('likeComment', () => {
    it('should like comment', async () => {
      vi.mocked(socialApi.likeComment).mockResolvedValue(undefined);

      const store = useSocialStore();
      await store.likeComment('comment-1');

      expect(socialApi.likeComment).toHaveBeenCalledWith('comment-1');
      expect(store.error).toBeNull();
    });
  });

  describe('unlikeComment', () => {
    it('should unlike comment', async () => {
      vi.mocked(socialApi.unlikeComment).mockResolvedValue(undefined);

      const store = useSocialStore();
      await store.unlikeComment('comment-1');

      expect(socialApi.unlikeComment).toHaveBeenCalledWith('comment-1');
      expect(store.error).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle errors on fetchFeed', async () => {
      vi.mocked(socialApi.getFeed).mockRejectedValue(new Error('Network error'));

      const store = useSocialStore();
      await store.fetchFeed();

      expect(store.error).toBe('Network error');
      expect(store.feedLoading).toBe(false);
    });

    it('should handle errors on fetchUserActivities', async () => {
      vi.mocked(socialApi.getUserActivities).mockRejectedValue(new Error('Not found'));

      const store = useSocialStore();
      await store.fetchUserActivities('user-1');

      expect(store.error).toBe('Not found');
      expect(store.feedLoading).toBe(false);
    });

    it('should handle errors on likeComment', async () => {
      vi.mocked(socialApi.likeComment).mockRejectedValue(new Error('Like failed'));

      const store = useSocialStore();
      await expect(store.likeComment('c-1')).rejects.toThrow('Like failed');
      expect(store.error).toBe('Like failed');
    });

    it('should handle errors on unlikeComment', async () => {
      vi.mocked(socialApi.unlikeComment).mockRejectedValue(new Error('Unlike failed'));

      const store = useSocialStore();
      await expect(store.unlikeComment('c-1')).rejects.toThrow('Unlike failed');
      expect(store.error).toBe('Unlike failed');
    });
  });

  describe('fetchMoreFeed', () => {
    it('should append activities on fetchMore', async () => {
      const store = useSocialStore();

      // Initial fetch — return exactly `limit` items so hasMore = true
      const initialBatch = Array.from({ length: 20 }, (_, i) => mockActivity({ id: `act-${i}` }));
      vi.mocked(socialApi.getFeed).mockResolvedValueOnce(initialBatch);
      await store.fetchFeed(20);
      expect(store.activities).toHaveLength(20);
      expect(store.hasMore).toBe(true);

      // Fetch more — return fewer than limit so hasMore = false
      const moreBatch = [mockActivity({ id: 'act-extra-1' }), mockActivity({ id: 'act-extra-2' })];
      vi.mocked(socialApi.getFeed).mockResolvedValueOnce(moreBatch);
      await store.fetchMoreFeed(20);

      expect(socialApi.getFeed).toHaveBeenLastCalledWith(20, 20);
      expect(store.activities).toHaveLength(22);
      expect(store.hasMore).toBe(false);
    });

    it('should not fetch more when hasMore is false', async () => {
      vi.mocked(socialApi.getFeed).mockResolvedValue([]);

      const store = useSocialStore();
      await store.fetchFeed();
      expect(store.hasMore).toBe(false);

      vi.clearAllMocks();
      await store.fetchMoreFeed();

      expect(socialApi.getFeed).not.toHaveBeenCalled();
    });
  });
});
