/**
 * NotificationService unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WSMessageType } from '@/types/websocket';

// Use vi.hoisted so mock variables are available in vi.mock factories
const mocks = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockOnConflictDoUpdate = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockValues = vi.fn().mockReturnValue({
    returning: mockReturning,
    onConflictDoUpdate: mockOnConflictDoUpdate,
  });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
  const mockUpdateReturning = vi.fn();
  const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
  const mockLimit = vi.fn();
  const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy, limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  return {
    mockReturning,
    mockOnConflictDoUpdate,
    mockValues,
    mockInsert,
    mockUpdateReturning,
    mockUpdateWhere,
    mockSet,
    mockUpdate,
    mockLimit,
    mockOrderBy,
    mockWhere,
    mockFrom,
    mockSelect,
  };
});

vi.mock('@db/index', () => ({
  db: {
    select: mocks.mockSelect,
    insert: mocks.mockInsert,
    update: mocks.mockUpdate,
  },
}));

vi.mock('@db/schema/social', () => ({
  notifications: {
    userId: 'userId',
    groupKey: 'groupKey',
    isRead: 'isRead',
    createdAt: 'createdAt',
    id: 'id',
    $inferInsert: {},
  },
}));

vi.mock('@db/schema/notification-preferences', () => ({
  notificationPreferences: {
    userId: 'userId',
    notificationType: 'notificationType',
    $inferInsert: {},
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ op: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  desc: vi.fn((col: unknown) => ({ op: 'desc', col })),
}));

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

// Import after mocks are set up
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let repo: MockRepo;
  let broadcastFn: ReturnType<typeof vi.fn>;
  let service: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chainable mock returns
    mocks.mockOnConflictDoUpdate.mockReturnValue({ returning: mocks.mockReturning });
    mocks.mockValues.mockReturnValue({
      returning: mocks.mockReturning,
      onConflictDoUpdate: mocks.mockOnConflictDoUpdate,
    });
    mocks.mockInsert.mockReturnValue({ values: mocks.mockValues });
    mocks.mockSet.mockReturnValue({ where: mocks.mockUpdateWhere });
    mocks.mockUpdate.mockReturnValue({ set: mocks.mockSet });
    mocks.mockOrderBy.mockReturnValue({ limit: mocks.mockLimit });
    mocks.mockWhere.mockReturnValue({ orderBy: mocks.mockOrderBy, limit: mocks.mockLimit });
    mocks.mockFrom.mockReturnValue({ where: mocks.mockWhere });
    mocks.mockSelect.mockReturnValue({ from: mocks.mockFrom });

    repo = createMockRepo();
    broadcastFn = vi.fn();
    service = new NotificationService(repo as any, broadcastFn);
  });

  describe('notify', () => {
    it('should create notification and broadcast via WebSocket', async () => {
      // Mock: no preference found (defaults apply: inApp=true)
      mocks.mockLimit.mockResolvedValueOnce([]);

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
      repo.createNotification.mockResolvedValueOnce(fakeNotification);
      repo.getUnreadCount.mockResolvedValue(5);

      const result = await service.notify({
        userId: 'user-1',
        type: 'follow',
        actorId: 'actor-1',
        targetType: 'user',
        targetId: 'user-1',
        message: 'Someone followed you',
      });

      expect(result).toEqual(fakeNotification);
      expect(repo.createNotification).toHaveBeenCalledWith(
        'user-1', 'follow', 'actor-1', 'user', 'user-1', 'Someone followed you',
      );

      // Should broadcast the notification
      expect(broadcastFn).toHaveBeenCalledTimes(2);

      const notifCall = broadcastFn.mock.calls[0];
      expect(notifCall[0]).toBe('user-1');
      expect(notifCall[1].type).toBe(WSMessageType.SOCIAL_NOTIFICATION);
      expect(notifCall[1].data.id).toBe('notif-1');
      expect(notifCall[1].data.type).toBe('follow');

      // Should broadcast updated unread count
      const countCall = broadcastFn.mock.calls[1];
      expect(countCall[0]).toBe('user-1');
      expect(countCall[1].type).toBe(WSMessageType.SOCIAL_UNREAD_COUNT);
      expect(countCall[1].data.count).toBe(5);
    });

    it('should skip in-app notification when preference inApp is false', async () => {
      // Mock: preference found with inApp=false
      mocks.mockLimit.mockResolvedValueOnce([{ inApp: false, email: true, emailFrequency: 'daily' }]);

      const result = await service.notify({
        userId: 'user-1',
        type: 'follow',
        actorId: 'actor-1',
        targetType: 'user',
        targetId: 'user-1',
        message: 'Someone followed you',
      });

      expect(result).toBeUndefined();
      expect(broadcastFn).not.toHaveBeenCalled();
    });

    it('should work without broadcastFn (no crash)', async () => {
      const serviceNoBroadcast = new NotificationService(repo as any);

      // Mock: no preference
      mocks.mockLimit.mockResolvedValueOnce([]);

      const fakeNotification = { id: 'notif-2', createdAt: new Date() };
      repo.createNotification.mockResolvedValueOnce(fakeNotification);

      const result = await serviceNoBroadcast.notify({
        userId: 'user-1',
        type: 'comment',
        actorId: 'actor-1',
        targetType: 'character',
        targetId: 'char-1',
        message: 'New comment',
      });

      expect(result).toEqual(fakeNotification);
      expect(repo.createNotification).toHaveBeenCalled();
      expect(broadcastFn).not.toHaveBeenCalled();
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

  describe('getPreferences', () => {
    it('should return defaults for all types when no preferences exist', async () => {
      mocks.mockWhere.mockResolvedValueOnce([]);

      const prefs = await service.getPreferences('user-1');

      expect(prefs).toHaveLength(10);
      expect(prefs[0]).toEqual({
        notificationType: 'follow',
        inApp: true,
        email: false,
        emailFrequency: 'immediate',
      });
    });

    it('should merge existing preferences with defaults', async () => {
      mocks.mockWhere.mockResolvedValueOnce([
        { notificationType: 'follow', inApp: false, email: true, emailFrequency: 'daily' },
      ]);

      const prefs = await service.getPreferences('user-1');

      const followPref = prefs.find((p) => p.notificationType === 'follow');
      expect(followPref).toEqual({
        notificationType: 'follow',
        inApp: false,
        email: true,
        emailFrequency: 'daily',
      });

      const commentPref = prefs.find((p) => p.notificationType === 'comment');
      expect(commentPref).toEqual({
        notificationType: 'comment',
        inApp: true,
        email: false,
        emailFrequency: 'immediate',
      });
    });
  });

  describe('updatePreference', () => {
    it('should upsert preference and return result', async () => {
      const fakeRow = {
        notificationType: 'follow',
        inApp: false,
        email: true,
        emailFrequency: 'daily',
      };
      mocks.mockReturning.mockResolvedValueOnce([fakeRow]);

      const result = await service.updatePreference('user-1', 'follow', {
        inApp: false,
        email: true,
        emailFrequency: 'daily',
      });

      expect(result).toEqual(fakeRow);
      expect(mocks.mockInsert).toHaveBeenCalled();
    });
  });
});
