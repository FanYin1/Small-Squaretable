/**
 * NotificationRepository unit tests (mocked DB)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../index', () => {
  const mockDb: any = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
  return { db: mockDb };
});

vi.mock('../schema/social', () => ({
  notifications: {
    id: 'id',
    userId: 'user_id',
    type: 'type',
    actorId: 'actor_id',
    targetType: 'target_type',
    targetId: 'target_id',
    message: 'message',
    isRead: 'is_read',
    createdAt: 'created_at',
  },
}));

vi.mock('../schema/users', () => ({
  users: {
    id: 'id',
    displayName: 'display_name',
    avatarUrl: 'avatar_url',
    tenantId: 'tenant_id',
  },
}));

vi.mock('../schema/tenants', () => ({
  tenants: { id: 'id' },
}));

import { NotificationRepository } from './notification.repository';
import { db } from '../index';

const mockDb = db as any;

function resetChains() {
  mockDb.insert.mockReturnThis();
  mockDb.values.mockReturnThis();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.leftJoin.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.orderBy.mockReturnThis();
  mockDb.limit.mockReturnThis();
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
  mockDb.delete.mockReturnThis();
}

const now = new Date('2026-01-01T00:00:00Z');

describe('NotificationRepository', () => {
  let repository: NotificationRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    resetChains();
    repository = new NotificationRepository(mockDb);
  });

  describe('createNotification', () => {
    it('should insert a notification record', async () => {
      const fakeNotification = {
        id: 'notif-1',
        userId: 'user-1',
        type: 'follow',
        actorId: 'actor-1',
        targetType: 'user',
        targetId: 'user-1',
        message: 'Actor User started following you',
        isRead: false,
        createdAt: now,
      };
      mockDb.returning.mockResolvedValueOnce([fakeNotification]);

      const notification = await repository.createNotification(
        'user-1', 'follow', 'actor-1', 'user', 'user-1', 'Actor User started following you',
      );

      expect(notification).toBeDefined();
      expect(notification.id).toBe('notif-1');
      expect(notification.userId).toBe('user-1');
      expect(notification.type).toBe('follow');
      expect(notification.actorId).toBe('actor-1');
      expect(notification.isRead).toBe(false);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('getNotifications', () => {
    it('should return paginated list with actor info', async () => {
      const rows = [
        {
          notification: {
            id: 'n1', type: 'follow', message: 'Notification 0',
            isRead: false, createdAt: now, targetType: 'user', targetId: 'user-1',
          },
          actor: { id: 'actor-1', displayName: 'Actor User', avatarUrl: null },
        },
        {
          notification: {
            id: 'n2', type: 'follow', message: 'Notification 1',
            isRead: false, createdAt: now, targetType: 'user', targetId: 'user-1',
          },
          actor: { id: 'actor-1', displayName: 'Actor User', avatarUrl: null },
        },
      ];
      mockDb.offset.mockResolvedValueOnce(rows);

      const items = await repository.getNotifications('user-1', 2, 0, false);

      expect(items).toHaveLength(2);
      expect(items[0].actor).toBeDefined();
      expect(items[0].actor!.id).toBe('actor-1');
      expect(items[0].actor!.displayName).toBe('Actor User');
      expect(items[0].type).toBe('follow');
      expect(items[0].isRead).toBe(false);
    });

    it('should respect offset for pagination', async () => {
      const rows = [
        {
          notification: {
            id: 'n3', type: 'follow', message: 'Notification 2',
            isRead: false, createdAt: now, targetType: 'user', targetId: 'user-1',
          },
          actor: { id: 'actor-1', displayName: 'Actor User', avatarUrl: null },
        },
      ];
      mockDb.offset.mockResolvedValueOnce(rows);

      const page2 = await repository.getNotifications('user-1', 2, 2, false);
      expect(page2).toHaveLength(1);
    });

    it('should order by createdAt descending', async () => {
      const rows = [
        {
          notification: {
            id: 'n2', type: 'comment', message: 'Second',
            isRead: false, createdAt: new Date('2026-01-02'), targetType: null, targetId: null,
          },
          actor: { id: 'actor-1', displayName: 'Actor', avatarUrl: null },
        },
        {
          notification: {
            id: 'n1', type: 'follow', message: 'First',
            isRead: false, createdAt: new Date('2026-01-01'), targetType: null, targetId: null,
          },
          actor: { id: 'actor-1', displayName: 'Actor', avatarUrl: null },
        },
      ];
      mockDb.offset.mockResolvedValueOnce(rows);

      const items = await repository.getNotifications('user-1', 10, 0, false);
      expect(items[0].message).toBe('Second');
      expect(items[1].message).toBe('First');
    });
  });

  describe('getUnreadCount', () => {
    it('should return count of unread notifications', async () => {
      mockDb.where.mockResolvedValueOnce([{ count: 2 }]);

      const count = await repository.getUnreadCount('user-1');
      expect(count).toBe(2);
    });

    it('should return 0 when all are read', async () => {
      mockDb.where.mockResolvedValueOnce([{ count: 0 }]);

      const count = await repository.getUnreadCount('user-1');
      expect(count).toBe(0);
    });
  });

  describe('markAsRead', () => {
    it('should set isRead to true', async () => {
      mockDb.returning.mockResolvedValueOnce([{ id: 'notif-1', isRead: true }]);

      const result = await repository.markAsRead('notif-1', 'user-1');
      expect(result).toBe(true);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should return false for wrong userId', async () => {
      mockDb.returning.mockResolvedValueOnce([]);

      const result = await repository.markAsRead('notif-1', 'wrong-user');
      expect(result).toBe(false);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all unread as read and return count', async () => {
      mockDb.returning.mockResolvedValueOnce([{ id: 'n1' }, { id: 'n2' }]);

      const count = await repository.markAllAsRead('user-1');
      expect(count).toBe(2);
    });

    it('should return 0 when no unread notifications', async () => {
      mockDb.returning.mockResolvedValueOnce([]);

      const count = await repository.markAllAsRead('user-1');
      expect(count).toBe(0);
    });
  });

  describe('deleteNotification', () => {
    it('should delete the notification record', async () => {
      mockDb.returning.mockResolvedValueOnce([{ id: 'notif-1' }]);

      const result = await repository.deleteNotification('notif-1', 'user-1');
      expect(result).toBe(true);
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should return false for wrong userId', async () => {
      mockDb.returning.mockResolvedValueOnce([]);

      const result = await repository.deleteNotification('notif-1', 'wrong-user');
      expect(result).toBe(false);
    });
  });
});
