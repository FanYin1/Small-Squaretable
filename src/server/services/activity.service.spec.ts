/**
 * ActivityService unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──
const { mockCreate, mockGetFeed, mockGetByUser, mockLoggerError } = vi.hoisted(() => {
  const mockCreate = vi.fn().mockResolvedValue({});
  const mockGetFeed = vi.fn().mockResolvedValue([]);
  const mockGetByUser = vi.fn().mockResolvedValue([]);
  const mockLoggerError = vi.fn();
  return { mockCreate, mockGetFeed, mockGetByUser, mockLoggerError };
});

vi.mock('../../db/repositories/activity.repository', () => ({
  activityRepository: {
    create: mockCreate,
    getFeed: mockGetFeed,
    getByUser: mockGetByUser,
  },
}));

vi.mock('./logger.service', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: mockLoggerError,
    }),
  },
}));

vi.mock('./event-bus.service', () => ({
  eventBus: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
}));

import { ActivityService } from './activity.service';
import { eventBus } from './event-bus.service';

describe('ActivityService', () => {
  let service: ActivityService;

  beforeEach(() => {
    service = new ActivityService();
  });

  describe('record', () => {
    it('should record an activity', async () => {
      await service.record('user-1', 'follow', 'user', 'user-2', { extra: true });

      expect(mockCreate).toHaveBeenCalledWith({
        userId: 'user-1',
        type: 'follow',
        targetType: 'user',
        targetId: 'user-2',
        metadata: { extra: true },
      });
    });

    it('should default optional fields to null', async () => {
      await service.record('user-1', 'login');

      expect(mockCreate).toHaveBeenCalledWith({
        userId: 'user-1',
        type: 'login',
        targetType: null,
        targetId: null,
        metadata: null,
      });
    });

    it('should handle record failure gracefully', async () => {
      mockCreate.mockRejectedValueOnce(new Error('DB down'));

      // Should not throw
      await expect(service.record('user-1', 'follow')).resolves.toBeUndefined();
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to record activity',
        expect.any(Error),
      );
    });
  });

  describe('getFeed', () => {
    it('should get feed for user', async () => {
      const fakeActivities = [{ id: 'a-1' }, { id: 'a-2' }];
      mockGetFeed.mockResolvedValueOnce(fakeActivities);

      const result = await service.getFeed('user-1', 10, 5);

      expect(mockGetFeed).toHaveBeenCalledWith('user-1', 10, 5);
      expect(result).toEqual(fakeActivities);
    });

    it('should use default limit and offset', async () => {
      await service.getFeed('user-1');

      expect(mockGetFeed).toHaveBeenCalledWith('user-1', 20, 0);
    });
  });

  describe('getUserActivities', () => {
    it('should get user activities', async () => {
      const fakeActivities = [{ id: 'a-3' }];
      mockGetByUser.mockResolvedValueOnce(fakeActivities);

      const result = await service.getUserActivities('user-1', 15, 10);

      expect(mockGetByUser).toHaveBeenCalledWith('user-1', 15, 10);
      expect(result).toEqual(fakeActivities);
    });

    it('should use default limit and offset', async () => {
      await service.getUserActivities('user-1');

      expect(mockGetByUser).toHaveBeenCalledWith('user-1', 20, 0);
    });
  });

  describe('registerListeners', () => {
    it('should register EventBus listeners for social events', () => {
      service.registerListeners();

      expect(eventBus.on).toHaveBeenCalledTimes(4);
      expect(eventBus.on).toHaveBeenCalledWith('social.follow', expect.any(Function));
      expect(eventBus.on).toHaveBeenCalledWith('social.favorite', expect.any(Function));
      expect(eventBus.on).toHaveBeenCalledWith('social.comment', expect.any(Function));
      expect(eventBus.on).toHaveBeenCalledWith('character.created', expect.any(Function));
    });
  });
});
