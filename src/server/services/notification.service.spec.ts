/**
 * NotificationService unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from './notification.service';
import { WSMessageType } from '@/types/websocket';

function createMockRepo() {
  return {
    createNotification: vi.fn(),
    getNotifications: vi.fn(),
    getUnreadCount: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    deleteNotification: vi.fn(),
  };
}

type MockRepo = ReturnType<typeof createMockRepo>;

describe('NotificationService', () => {
  let repo: MockRepo;
  let broadcastFn: ReturnType<typeof vi.fn>;
  let service: NotificationService;

  beforeEach(() => {
    repo = createMockRepo();
    broadcastFn = vi.fn();
    service = new NotificationService(repo as any, broadcastFn);
  });

  describe('notify', () => {
    it('should create notification and broadcast via WebSocket', async () => {
      const fakeNotification = {
        id: 'notif-1',
        userId: 'user-1',
        type: 'follow',
        actorId: 'actor-1',
        targetType: 'user',
        targetId: 'user-1',
        message: 'Someone followed you',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        isRead: false,
      };
      repo.createNotification.mockResolvedValue(fakeNotification);
      repo.getUnreadCount.mockResolvedValue(5);

      const result = await service.notify(
        'user-1',
        'follow',
        'actor-1',
        'user',
        'user-1',
        'Someone followed you',
      );

      expect(repo.createNotification).toHaveBeenCalledWith(
        'user-1', 'follow', 'actor-1', 'user', 'user-1', 'Someone followed you',
      );
      expect(result).toEqual(fakeNotification);

      // Should broadcast the notification
      expect(broadcastFn).toHaveBeenCalledTimes(2);

      const notifCall = broadcastFn.mock.calls[0];
      expect(notifCall[0]).toBe('user-1');
      expect(notifCall[1].type).toBe(WSMessageType.SOCIAL_NOTIFICATION);
      expect(notifCall[1].data.id).toBe('notif-1');
      expect(notifCall[1].data.type).toBe('follow');
      expect(notifCall[1].data.message).toBe('Someone followed you');
      expect(notifCall[1].data.actorId).toBe('actor-1');
      expect(notifCall[1].data.targetType).toBe('user');
      expect(notifCall[1].data.targetId).toBe('user-1');
      expect(notifCall[1].timestamp).toBeTypeOf('string');

      // Should broadcast updated unread count
      const countCall = broadcastFn.mock.calls[1];
      expect(countCall[0]).toBe('user-1');
      expect(countCall[1].type).toBe(WSMessageType.SOCIAL_UNREAD_COUNT);
      expect(countCall[1].data.count).toBe(5);
    });

    it('should work without broadcastFn (no crash)', async () => {
      const serviceNoBroadcast = new NotificationService(repo as any);
      const fakeNotification = {
        id: 'notif-2',
        createdAt: new Date(),
      };
      repo.createNotification.mockResolvedValue(fakeNotification);

      const result = await serviceNoBroadcast.notify(
        'user-1', 'comment', 'actor-1', 'character', 'char-1', 'New comment',
      );

      expect(result).toEqual(fakeNotification);
      expect(repo.createNotification).toHaveBeenCalledTimes(1);
      // broadcastFn should not have been called (it's undefined)
      expect(broadcastFn).not.toHaveBeenCalled();
      // getUnreadCount should not be called when no broadcastFn
      expect(repo.getUnreadCount).not.toHaveBeenCalled();
    });
  });

  describe('getNotifications', () => {
    it('should delegate to repo', async () => {
      const fakeNotifications = [
        { id: 'n1', type: 'follow', message: 'Followed' },
        { id: 'n2', type: 'comment', message: 'Commented' },
      ];
      repo.getNotifications.mockResolvedValue(fakeNotifications);

      const result = await service.getNotifications('user-1', 20, 0, false);

      expect(repo.getNotifications).toHaveBeenCalledWith('user-1', 20, 0, false);
      expect(result).toEqual(fakeNotifications);
    });
  });

  describe('getUnreadCount', () => {
    it('should delegate to repo', async () => {
      repo.getUnreadCount.mockResolvedValue(7);

      const result = await service.getUnreadCount('user-1');

      expect(repo.getUnreadCount).toHaveBeenCalledWith('user-1');
      expect(result).toBe(7);
    });
  });

  describe('markAsRead', () => {
    it('should mark as read and broadcast updated count', async () => {
      repo.markAsRead.mockResolvedValue(true);
      repo.getUnreadCount.mockResolvedValue(3);

      const result = await service.markAsRead('notif-1', 'user-1');

      expect(repo.markAsRead).toHaveBeenCalledWith('notif-1', 'user-1');
      expect(result).toBe(true);

      // Should broadcast updated unread count
      expect(broadcastFn).toHaveBeenCalledTimes(1);
      const call = broadcastFn.mock.calls[0];
      expect(call[0]).toBe('user-1');
      expect(call[1].type).toBe(WSMessageType.SOCIAL_UNREAD_COUNT);
      expect(call[1].data.count).toBe(3);
    });

    it('should not broadcast if markAsRead returns false', async () => {
      repo.markAsRead.mockResolvedValue(false);

      const result = await service.markAsRead('notif-999', 'user-1');

      expect(result).toBe(false);
      expect(broadcastFn).not.toHaveBeenCalled();
      expect(repo.getUnreadCount).not.toHaveBeenCalled();
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all as read and broadcast count=0', async () => {
      repo.markAllAsRead.mockResolvedValue(4);

      const result = await service.markAllAsRead('user-1');

      expect(repo.markAllAsRead).toHaveBeenCalledWith('user-1');
      expect(result).toBe(4);

      // Should broadcast count=0
      expect(broadcastFn).toHaveBeenCalledTimes(1);
      const call = broadcastFn.mock.calls[0];
      expect(call[0]).toBe('user-1');
      expect(call[1].type).toBe(WSMessageType.SOCIAL_UNREAD_COUNT);
      expect(call[1].data.count).toBe(0);
    });
  });

  describe('deleteNotification', () => {
    it('should delegate to repo', async () => {
      repo.deleteNotification.mockResolvedValue(true);

      const result = await service.deleteNotification('notif-1', 'user-1');

      expect(repo.deleteNotification).toHaveBeenCalledWith('notif-1', 'user-1');
      expect(result).toBe(true);
    });

    it('should return false when notification not found or not owned', async () => {
      repo.deleteNotification.mockResolvedValue(false);

      const result = await service.deleteNotification('notif-999', 'user-1');

      expect(result).toBe(false);
    });
  });
});
