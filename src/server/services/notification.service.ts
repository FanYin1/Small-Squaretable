/**
 * Notification Service
 *
 * Manages user notifications with real-time WebSocket push
 */

import type { NotificationRepository } from '@db/repositories/notification.repository';
import type { NotificationType } from '@/types/social';
import { WSMessageType } from '@/types/websocket';

export class NotificationService {
  constructor(
    private repo: NotificationRepository,
    private broadcastFn?: (userId: string, message: Record<string, unknown>) => void,
  ) {}

  /**
   * Create a notification and push it via WebSocket
   */
  async notify(
    userId: string,
    type: NotificationType,
    actorId: string,
    targetType: string,
    targetId: string,
    message: string,
  ) {
    const notification = await this.repo.createNotification(userId, type, actorId, targetType, targetId, message);

    // Push real-time notification via WebSocket
    if (this.broadcastFn) {
      this.broadcastFn(userId, {
        type: WSMessageType.SOCIAL_NOTIFICATION,
        timestamp: new Date().toISOString(),
        data: {
          id: notification.id,
          type,
          message,
          actorId,
          targetType,
          targetId,
          createdAt: notification.createdAt,
        },
      });

      // Push updated unread count
      const count = await this.repo.getUnreadCount(userId);
      this.broadcastFn(userId, {
        type: WSMessageType.SOCIAL_UNREAD_COUNT,
        timestamp: new Date().toISOString(),
        data: { count },
      });
    }

    return notification;
  }

  /**
   * Get paginated notifications for a user
   */
  async getNotifications(userId: string, limit: number, offset: number, unreadOnly: boolean) {
    return this.repo.getNotifications(userId, limit, offset, unreadOnly);
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string) {
    return this.repo.getUnreadCount(userId);
  }

  /**
   * Mark a single notification as read and push updated count
   */
  async markAsRead(notificationId: string, userId: string) {
    const result = await this.repo.markAsRead(notificationId, userId);

    if (result && this.broadcastFn) {
      const count = await this.repo.getUnreadCount(userId);
      this.broadcastFn(userId, {
        type: WSMessageType.SOCIAL_UNREAD_COUNT,
        timestamp: new Date().toISOString(),
        data: { count },
      });
    }

    return result;
  }

  /**
   * Mark all notifications as read and push count=0
   */
  async markAllAsRead(userId: string) {
    const count = await this.repo.markAllAsRead(userId);

    if (this.broadcastFn) {
      this.broadcastFn(userId, {
        type: WSMessageType.SOCIAL_UNREAD_COUNT,
        timestamp: new Date().toISOString(),
        data: { count: 0 },
      });
    }

    return count;
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: string, userId: string) {
    return this.repo.deleteNotification(notificationId, userId);
  }
}

import { notificationRepository } from '@db/repositories/notification.repository';

// Note: broadcastFn will be set after websocket handler is initialized
export const notificationService = new NotificationService(notificationRepository);
