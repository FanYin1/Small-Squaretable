/**
 * Notification Repository
 *
 * 处理用户通知的数据访问
 */

import { eq, and, sql, desc } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { notifications, type Notification } from '../schema/social';
import { users } from '../schema/users';
import type { NotificationType, NotificationItem } from '@/types/social';

export class NotificationRepository extends BaseRepository {
  /**
   * Create a notification
   */
  async createNotification(
    userId: string,
    type: NotificationType,
    actorId: string,
    targetType: string,
    targetId: string,
    message: string,
  ): Promise<Notification> {
    const result = await this.db
      .insert(notifications)
      .values({
        userId,
        type,
        actorId,
        targetType,
        targetId,
        message,
      })
      .returning();
    return result[0];
  }

  /**
   * Get paginated notifications for a user (join with users on actorId for actor info)
   * If unreadOnly=true, filter to isRead=false
   * Order by createdAt desc
   */
  async getNotifications(
    userId: string,
    limit: number,
    offset: number,
    unreadOnly: boolean,
  ): Promise<NotificationItem[]> {
    const conditions = [eq(notifications.userId, userId)];
    if (unreadOnly) {
      conditions.push(eq(notifications.isRead, false));
    }
    const rows = await this.db
      .select({
        notification: notifications,
        actor: {
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.actorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map((row) => ({
      id: row.notification.id,
      type: row.notification.type as NotificationType,
      message: row.notification.message,
      isRead: row.notification.isRead,
      createdAt: row.notification.createdAt.toISOString(),
      actor: row.actor?.id
        ? {
            id: row.actor.id,
            displayName: row.actor.displayName,
            avatarUrl: row.actor.avatarUrl,
          }
        : undefined,
      targetType: row.notification.targetType ?? undefined,
      targetId: row.notification.targetId ?? undefined,
    }));
  }

  /**
   * Count unread notifications for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.isRead, false)),
      );
    return count;
  }

  /**
   * Mark single notification as read (ownership check: userId must match)
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId),
        ),
      )
      .returning();
    return result.length > 0;
  }

  /**
   * Mark all unread notifications as read for a user. Return count of updated.
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(eq(notifications.userId, userId), eq(notifications.isRead, false)),
      )
      .returning();
    return result.length;
  }

  /**
   * Hard-delete a notification (ownership check)
   */
  async deleteNotification(
    notificationId: string,
    userId: string,
  ): Promise<boolean> {
    const result = await this.db
      .delete(notifications)
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId),
        ),
      )
      .returning();
    return result.length > 0;
  }
}

export const notificationRepository = new NotificationRepository(db);