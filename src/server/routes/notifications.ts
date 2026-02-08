/**
 * Notification Routes
 *
 * API endpoints for managing user notifications
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { notificationService } from '../services/notification.service';
import { listNotificationsQuerySchema } from '@/types/social';
import type { ApiResponse } from '@/types/api';

const notificationRoutes = new Hono();

/**
 * GET / - List notifications for the current user
 */
notificationRoutes.get(
  '/',
  authMiddleware(),
  zValidator('query', listNotificationsQuerySchema),
  async (c) => {
    const user = c.get('user');
    const { limit, offset, unreadOnly } = c.req.valid('query');
    const notifications = await notificationService.getNotifications(user.id, limit, offset, unreadOnly);

    return c.json<ApiResponse>(
      {
        success: true,
        data: notifications,
        meta: { timestamp: new Date().toISOString() },
      },
      200,
    );
  },
);

/**
 * GET /unread-count - Get unread notification count
 */
notificationRoutes.get('/unread-count', authMiddleware(), async (c) => {
  const user = c.get('user');
  const count = await notificationService.getUnreadCount(user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { count },
      meta: { timestamp: new Date().toISOString() },
    },
    200,
  );
});

/**
 * PATCH /:id/read - Mark a single notification as read
 */
notificationRoutes.patch('/:id/read', authMiddleware(), async (c) => {
  const user = c.get('user');
  const notificationId = c.req.param('id');
  await notificationService.markAsRead(notificationId, user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { message: 'Notification marked as read' },
      meta: { timestamp: new Date().toISOString() },
    },
    200,
  );
});

/**
 * POST /read-all - Mark all notifications as read
 */
notificationRoutes.post('/read-all', authMiddleware(), async (c) => {
  const user = c.get('user');
  const count = await notificationService.markAllAsRead(user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { markedCount: count },
      meta: { timestamp: new Date().toISOString() },
    },
    200,
  );
});

/**
 * DELETE /:id - Delete a notification
 */
notificationRoutes.delete('/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const notificationId = c.req.param('id');
  await notificationService.deleteNotification(notificationId, user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { message: 'Notification deleted' },
      meta: { timestamp: new Date().toISOString() },
    },
    200,
  );
});

export { notificationRoutes };
