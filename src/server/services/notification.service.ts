/**
 * Notification Service
 *
 * Manages user notifications with real-time WebSocket push,
 * preference checking, and notification grouping.
 */

import { eq, and, desc } from 'drizzle-orm';
import { db } from '@db/index';
import { notifications } from '@db/schema/social';
import { notificationPreferences } from '@db/schema/notification-preferences';
import type { NotificationRepository } from '@db/repositories/notification.repository';
import type { NotificationType } from '@/types/social';
import { WSMessageType } from '@/types/websocket';

/** All known notification types with their default preferences */
const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  'follow',
  'favorite',
  'comment',
  'reply',
  'mention',
  'collaborator_invite',
  'collaborator_role_change',
  'collaborator_removed',
  'character_forked',
  'system',
];

interface NotifyOptions {
  userId: string;
  type: NotificationType;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  message: string;
  groupKey?: string;
  priority?: string;
}

interface PreferenceSettings {
  inApp?: boolean;
  email?: boolean;
  emailFrequency?: string;
}

interface PreferenceRecord {
  notificationType: string;
  inApp: boolean;
  email: boolean;
  emailFrequency: string;
}

export class NotificationService {
  constructor(
    private repo: NotificationRepository,
    private broadcastFn?: (userId: string, message: Record<string, unknown>) => void,
  ) {}

  /**
   * Set the WebSocket broadcast function (called after WS handler is initialized)
   */
  setBroadcastFn(fn: (userId: string, message: Record<string, unknown>) => void): void {
    this.broadcastFn = fn;
  }

  /**
   * Create a notification with preference checking and grouping support
   */
  async notify(options: NotifyOptions) {
    const { userId, type, actorId, targetType, targetId, message, groupKey, priority } = options;

    // 1. Check user preferences for this notification type (graceful fallback if DB unavailable)
    let inAppEnabled = true;
    try {
      const prefs = await db
        .select()
        .from(notificationPreferences)
        .where(
          and(
            eq(notificationPreferences.userId, userId),
            eq(notificationPreferences.notificationType, type),
          ),
        )
        .limit(1);

      const pref = prefs[0];
      inAppEnabled = pref ? pref.inApp : true;
    } catch {
      // Preferences table may not exist yet or DB unavailable — default to enabled
    }

    // 2. Skip in-app notification if user disabled it
    if (!inAppEnabled) {
      return undefined;
    }

    // 3. Grouping: if groupKey provided, try to update existing unread notification
    if (groupKey) {
      try {
        const existing = await db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              eq(notifications.groupKey, groupKey),
              eq(notifications.isRead, false),
            ),
          )
          .orderBy(desc(notifications.createdAt))
          .limit(1);

        if (existing.length > 0) {
          const updated = await db
            .update(notifications)
            .set({
              message,
              createdAt: new Date(),
            })
            .where(eq(notifications.id, existing[0].id))
            .returning();

          const notification = updated[0];

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

            const count = await this.repo.getUnreadCount(userId);
            this.broadcastFn(userId, {
              type: WSMessageType.SOCIAL_UNREAD_COUNT,
              timestamp: new Date().toISOString(),
              data: { count },
            });
          }

          return notification;
        }
      } catch {
        // Grouping query failed — fall through to create new notification
      }
    }

    // 4. Create new notification via repository
    const notification = await this.repo.createNotification(
      userId,
      type,
      actorId ?? '',
      targetType ?? '',
      targetId ?? '',
      message,
    );

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
   * Get all preferences for a user, with defaults for types without explicit records
   */
  async getPreferences(userId: string): Promise<PreferenceRecord[]> {
    const rows = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));

    const prefMap = new Map(rows.map((r) => [r.notificationType, r]));

    return ALL_NOTIFICATION_TYPES.map((type) => {
      const existing = prefMap.get(type);
      return {
        notificationType: type,
        inApp: existing ? existing.inApp : true,
        email: existing ? existing.email : false,
        emailFrequency: existing ? existing.emailFrequency : 'immediate',
      };
    });
  }

  /**
   * Upsert a preference record for a user and notification type
   */
  async updatePreference(
    userId: string,
    type: string,
    settings: PreferenceSettings,
  ): Promise<PreferenceRecord> {
    const values: Record<string, unknown> = {
      userId,
      notificationType: type,
    };
    if (settings.inApp !== undefined) values.inApp = settings.inApp;
    if (settings.email !== undefined) values.email = settings.email;
    if (settings.emailFrequency !== undefined) values.emailFrequency = settings.emailFrequency;

    const setClause: Record<string, unknown> = { updatedAt: new Date() };
    if (settings.inApp !== undefined) setClause.inApp = settings.inApp;
    if (settings.email !== undefined) setClause.email = settings.email;
    if (settings.emailFrequency !== undefined) setClause.emailFrequency = settings.emailFrequency;

    const result = await db
      .insert(notificationPreferences)
      .values(values as typeof notificationPreferences.$inferInsert)
      .onConflictDoUpdate({
        target: [notificationPreferences.userId, notificationPreferences.notificationType],
        set: setClause,
      })
      .returning();

    const row = result[0];
    return {
      notificationType: row.notificationType,
      inApp: row.inApp,
      email: row.email,
      emailFrequency: row.emailFrequency,
    };
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
