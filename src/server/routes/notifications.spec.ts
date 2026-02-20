/**
 * Notification Routes Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// Mock auth middleware
vi.mock('../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', {
      id: 'user-123',
      tenantId: 'tenant-123',
      email: 'test@example.com',
      displayName: 'Test User',
      avatarUrl: null,
      role: 'user',
    });
    return next();
  },
}));

// Mock notification service
vi.mock('../services/notification.service', () => ({
  notificationService: {
    getNotifications: vi.fn(),
    getUnreadCount: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    deleteNotification: vi.fn(),
  },
}));

import { notificationRoutes } from './notifications';
import { notificationService } from '../services/notification.service';

describe('Notification Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/notifications', notificationRoutes);
    vi.clearAllMocks();
  });

  describe('GET /', () => {
    it('should return 200 with notification list', async () => {
      const mockNotifications = [
        { id: 'n1', type: 'follow', message: 'User followed you', read: false, createdAt: new Date().toISOString() },
        { id: 'n2', type: 'comment', message: 'New comment', read: true, createdAt: new Date().toISOString() },
      ];
      vi.mocked(notificationService.getNotifications).mockResolvedValue(mockNotifications as any);

      const res = await app.request('/notifications?limit=20&offset=0');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockNotifications);
      expect(notificationService.getNotifications).toHaveBeenCalledWith('user-123', 20, 0, false);
    });

    it('should pass unreadOnly query parameter', async () => {
      vi.mocked(notificationService.getNotifications).mockResolvedValue([] as any);

      const res = await app.request('/notifications?limit=10&offset=0&unreadOnly=true');
      expect(res.status).toBe(200);
      expect(notificationService.getNotifications).toHaveBeenCalledWith('user-123', 10, 0, true);
    });
  });

  describe('GET /unread-count', () => {
    it('should return 200 with count', async () => {
      vi.mocked(notificationService.getUnreadCount).mockResolvedValue(5 as any);

      const res = await app.request('/notifications/unread-count');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.count).toBe(5);
      expect(notificationService.getUnreadCount).toHaveBeenCalledWith('user-123');
    });
  });

  describe('PATCH /:id/read', () => {
    it('should return 200 when marking notification as read', async () => {
      vi.mocked(notificationService.markAsRead).mockResolvedValue(undefined as any);

      const res = await app.request('/notifications/n1/read', { method: 'PATCH' });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.message).toBe('Notification marked as read');
      expect(notificationService.markAsRead).toHaveBeenCalledWith('n1', 'user-123');
    });
  });

  describe('POST /read-all', () => {
    it('should return 200 with markedCount', async () => {
      vi.mocked(notificationService.markAllAsRead).mockResolvedValue(7 as any);

      const res = await app.request('/notifications/read-all', { method: 'POST' });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.markedCount).toBe(7);
      expect(notificationService.markAllAsRead).toHaveBeenCalledWith('user-123');
    });
  });

  describe('DELETE /:id', () => {
    it('should return 200 when deleting a notification', async () => {
      vi.mocked(notificationService.deleteNotification).mockResolvedValue(undefined as any);

      const res = await app.request('/notifications/n1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.message).toBe('Notification deleted');
      expect(notificationService.deleteNotification).toHaveBeenCalledWith('n1', 'user-123');
    });
  });
});
