import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useNotificationStore } from './notification';
import { notificationApi } from '@client/services/notification.api';
import type { NotificationItem } from '@/types/social';

vi.mock('@client/services/notification.api', () => ({
  notificationApi: {
    getUnreadCount: vi.fn(),
    getNotifications: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    deleteNotification: vi.fn(),
  },
}));

vi.mock('@client/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

const makeNotification = (overrides: Partial<NotificationItem> = {}): NotificationItem => ({
  id: 'n-1',
  type: 'follow',
  message: 'User X followed you',
  isRead: false,
  createdAt: '2026-02-01T00:00:00Z',
  ...overrides,
});

const makeMany = (count: number): NotificationItem[] =>
  Array.from({ length: count }, (_, i) => makeNotification({ id: `n-${i}` }));

describe('Notification Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  // 1. Initial state
  it('should have correct initial state', () => {
    const store = useNotificationStore();
    expect(store.notifications).toEqual([]);
    expect(store.unreadCount).toBe(0);
    expect(store.loading).toBe(false);
    expect(store.hasMore).toBe(true);
  });

  // 2. hasUnread — true when unreadCount > 0
  it('should return hasUnread true when unreadCount > 0', () => {
    const store = useNotificationStore();
    store.unreadCount = 3;
    expect(store.hasUnread).toBe(true);
  });

  // 3. hasUnread — false when unreadCount is 0
  it('should return hasUnread false when unreadCount is 0', () => {
    const store = useNotificationStore();
    expect(store.hasUnread).toBe(false);
  });

  // 4. fetchUnreadCount — success sets count
  it('should fetch and set unread count', async () => {
    vi.mocked(notificationApi.getUnreadCount).mockResolvedValue({ count: 5 });

    const store = useNotificationStore();
    await store.fetchUnreadCount();

    expect(store.unreadCount).toBe(5);
    expect(notificationApi.getUnreadCount).toHaveBeenCalledOnce();
  });

  // 5. fetchUnreadCount — error logs
  it('should handle fetchUnreadCount error gracefully', async () => {
    vi.mocked(notificationApi.getUnreadCount).mockRejectedValue(new Error('Network error'));

    const store = useNotificationStore();
    store.unreadCount = 3;
    await store.fetchUnreadCount();

    expect(store.unreadCount).toBe(3); // unchanged
  });

  // 6. fetchNotifications reset=true — replaces notifications
  it('should replace notifications when reset=true', async () => {
    const fresh = [makeNotification({ id: 'fresh-1' })];
    vi.mocked(notificationApi.getNotifications).mockResolvedValue(fresh);

    const store = useNotificationStore();
    store.notifications = [makeNotification({ id: 'old-1' })];

    await store.fetchNotifications(true);

    expect(store.notifications).toEqual(fresh);
    expect(notificationApi.getNotifications).toHaveBeenCalledWith(20, 0);
  });

  // 7. fetchNotifications reset=false — appends notifications
  it('should append notifications when reset=false', async () => {
    const existing = [makeNotification({ id: 'e-1' })];
    const more = [makeNotification({ id: 'm-1' })];
    vi.mocked(notificationApi.getNotifications).mockResolvedValue(more);

    const store = useNotificationStore();
    store.notifications = [...existing];

    await store.fetchNotifications(false);

    expect(store.notifications).toHaveLength(2);
    expect(store.notifications[0].id).toBe('e-1');
    expect(store.notifications[1].id).toBe('m-1');
    expect(notificationApi.getNotifications).toHaveBeenCalledWith(20, 1);
  });

  // 8. fetchNotifications — sets hasMore=true when result.length === 20
  it('should set hasMore true when result length equals 20', async () => {
    vi.mocked(notificationApi.getNotifications).mockResolvedValue(makeMany(20));

    const store = useNotificationStore();
    await store.fetchNotifications(true);

    expect(store.hasMore).toBe(true);
  });

  // 9. fetchNotifications — sets hasMore=false when result.length < 20
  it('should set hasMore false when result length is less than 20', async () => {
    vi.mocked(notificationApi.getNotifications).mockResolvedValue(makeMany(5));

    const store = useNotificationStore();
    await store.fetchNotifications(true);

    expect(store.hasMore).toBe(false);
  });

  // 10. fetchNotifications — skips if already loading
  it('should skip fetchNotifications if already loading', async () => {
    vi.mocked(notificationApi.getNotifications).mockResolvedValue([]);

    const store = useNotificationStore();
    store.loading = true;

    await store.fetchNotifications();

    expect(notificationApi.getNotifications).not.toHaveBeenCalled();
  });

  // 11. fetchNotifications — error logs, loading resets
  it('should handle fetchNotifications error and reset loading', async () => {
    vi.mocked(notificationApi.getNotifications).mockRejectedValue(new Error('Server error'));

    const store = useNotificationStore();
    await store.fetchNotifications();

    expect(store.loading).toBe(false);
    expect(store.notifications).toEqual([]);
  });

  // 12. markAsRead — success, marks read, decrements unreadCount
  it('should mark notification as read and decrement unreadCount', async () => {
    vi.mocked(notificationApi.markAsRead).mockResolvedValue(undefined as never);

    const store = useNotificationStore();
    store.notifications = [makeNotification({ id: 'n-1', isRead: false })];
    store.unreadCount = 3;

    await store.markAsRead('n-1');

    expect(store.notifications[0].isRead).toBe(true);
    expect(store.unreadCount).toBe(2);
    expect(notificationApi.markAsRead).toHaveBeenCalledWith('n-1');
  });

  // 13. markAsRead — skips if already read (no decrement)
  it('should not decrement unreadCount if notification is already read', async () => {
    vi.mocked(notificationApi.markAsRead).mockResolvedValue(undefined as never);

    const store = useNotificationStore();
    store.notifications = [makeNotification({ id: 'n-1', isRead: true })];
    store.unreadCount = 3;

    await store.markAsRead('n-1');

    expect(store.unreadCount).toBe(3); // unchanged
  });

  // 14. markAllAsRead — success, marks all read, sets unreadCount to 0
  it('should mark all notifications as read and reset unreadCount', async () => {
    vi.mocked(notificationApi.markAllAsRead).mockResolvedValue(undefined as never);

    const store = useNotificationStore();
    store.notifications = [
      makeNotification({ id: 'n-1', isRead: false }),
      makeNotification({ id: 'n-2', isRead: true }),
      makeNotification({ id: 'n-3', isRead: false }),
    ];
    store.unreadCount = 2;

    await store.markAllAsRead();

    expect(store.notifications.every(n => n.isRead)).toBe(true);
    expect(store.unreadCount).toBe(0);
  });

  // 15. deleteNotification — success, removes from array, decrements if unread
  it('should delete unread notification and decrement unreadCount', async () => {
    vi.mocked(notificationApi.deleteNotification).mockResolvedValue(undefined as never);

    const store = useNotificationStore();
    store.notifications = [
      makeNotification({ id: 'n-1', isRead: false }),
      makeNotification({ id: 'n-2', isRead: true }),
    ];
    store.unreadCount = 1;

    await store.deleteNotification('n-1');

    expect(store.notifications).toHaveLength(1);
    expect(store.notifications[0].id).toBe('n-2');
    expect(store.unreadCount).toBe(0);
  });

  // 16. deleteNotification — success, removes from array, no decrement if already read
  it('should delete read notification without decrementing unreadCount', async () => {
    vi.mocked(notificationApi.deleteNotification).mockResolvedValue(undefined as never);

    const store = useNotificationStore();
    store.notifications = [
      makeNotification({ id: 'n-1', isRead: true }),
      makeNotification({ id: 'n-2', isRead: false }),
    ];
    store.unreadCount = 1;

    await store.deleteNotification('n-1');

    expect(store.notifications).toHaveLength(1);
    expect(store.notifications[0].id).toBe('n-2');
    expect(store.unreadCount).toBe(1); // unchanged
  });

  // 17. handleWsNotification — unshifts + increments unreadCount
  it('should unshift WS notification and increment unreadCount', () => {
    const store = useNotificationStore();
    store.notifications = [makeNotification({ id: 'existing' })];
    store.unreadCount = 1;

    const incoming = makeNotification({ id: 'ws-new', type: 'comment' });
    store.handleWsNotification(incoming);

    expect(store.notifications).toHaveLength(2);
    expect(store.notifications[0].id).toBe('ws-new');
    expect(store.unreadCount).toBe(2);
  });

  // 18. handleWsUnreadCount — sets count
  it('should set unreadCount from WS event', () => {
    const store = useNotificationStore();
    store.unreadCount = 0;

    store.handleWsUnreadCount(42);

    expect(store.unreadCount).toBe(42);
  });
});
