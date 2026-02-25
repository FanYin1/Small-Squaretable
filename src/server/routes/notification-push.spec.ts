/**
 * Notification Push Subscription Routes Tests
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

const { mockSAdd, mockSRem, mockExpire } = vi.hoisted(() => ({
  mockSAdd: vi.fn().mockResolvedValue(1),
  mockSRem: vi.fn().mockResolvedValue(1),
  mockExpire: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/core/redis', () => ({
  getRedisClient: vi.fn().mockResolvedValue({
    sAdd: mockSAdd,
    sRem: mockSRem,
    expire: mockExpire,
  }),
}));

import { notificationRoutes } from './notifications';

describe('Notification Push Subscription Routes', () => {
  let app: Hono;

  const mockSubscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: {
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REfXRI',
      auth: 'tBHItJI5svbpC7htgNQ8Uw',
    },
  };

  beforeEach(() => {
    app = new Hono();
    app.route('/notifications', notificationRoutes);
    vi.clearAllMocks();
  });

  describe('POST /push-subscription', () => {
    it('should save push subscription and return success', async () => {
      const res = await app.request('/notifications/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockSubscription),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockSAdd).toHaveBeenCalledWith(
        'push:subscriptions:user-123',
        JSON.stringify(mockSubscription),
      );
      expect(mockExpire).toHaveBeenCalledWith(
        'push:subscriptions:user-123',
        30 * 24 * 60 * 60,
      );
    });
  });

  describe('DELETE /push-subscription', () => {
    it('should remove push subscription and return success', async () => {
      const res = await app.request('/notifications/push-subscription', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockSubscription),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockSRem).toHaveBeenCalledWith(
        'push:subscriptions:user-123',
        JSON.stringify(mockSubscription),
      );
    });
  });
});
