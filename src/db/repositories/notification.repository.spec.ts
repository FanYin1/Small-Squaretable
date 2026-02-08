/**
 * NotificationRepository 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../index';
import { notifications } from '../schema/social';
import { users } from '../schema/users';
import { tenants } from '../schema/tenants';
import { NotificationRepository } from './notification.repository';
import { eq } from 'drizzle-orm';

describe('NotificationRepository', () => {
  let repository: NotificationRepository;
  let testTenantId: string;
  let testUserId: string;
  let actorUserId: string;

  beforeEach(async () => {
    repository = new NotificationRepository(db);

    // Create test tenant
    const [tenant] = await db.insert(tenants).values({
      name: 'Test Tenant',
      slug: 'test-tenant-' + Date.now(),
    }).returning();
    testTenantId = tenant.id;

    // Create test user (notification recipient)
    const [user] = await db.insert(users).values({
      tenantId: testTenantId,
      email: `test-user-${Date.now()}@example.com`,
      passwordHash: 'hash',
      username: `testuser-${Date.now()}`,
    }).returning();
    testUserId = user.id;

    // Create actor user (notification sender)
    const [actor] = await db.insert(users).values({
      tenantId: testTenantId,
      email: `actor-${Date.now()}@example.com`,
      passwordHash: 'hash',
      username: `actor-${Date.now()}`,
      displayName: 'Actor User',
    }).returning();
    actorUserId = actor.id;
  });

  afterEach(async () => {
    // Clean up in reverse order of dependencies
    await db.delete(notifications);
    await db.delete(users).where(eq(users.tenantId, testTenantId));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  });

  describe('createNotification', () => {
    it('should insert a notification record', async () => {
      const notification = await repository.createNotification(
        testUserId,
        'follow',
        actorUserId,
        'user',
        testUserId,
        'Actor User started following you',
      );

      expect(notification).toBeDefined();
      expect(notification.id).toBeDefined();
      expect(notification.userId).toBe(testUserId);
      expect(notification.type).toBe('follow');
      expect(notification.actorId).toBe(actorUserId);
      expect(notification.targetType).toBe('user');
      expect(notification.targetId).toBe(testUserId);
      expect(notification.message).toBe('Actor User started following you');
      expect(notification.isRead).toBe(false);
      expect(notification.createdAt).toBeDefined();
    });
  });

  describe('getNotifications', () => {
    it('should return paginated list with actor info', async () => {
      // Create 3 notifications
      for (let i = 0; i < 3; i++) {
        await repository.createNotification(
          testUserId,
          'follow',
          actorUserId,
          'user',
          testUserId,
          `Notification ${i}`,
        );
      }

      const items = await repository.getNotifications(testUserId, 2, 0, false);

      expect(items).toHaveLength(2);
      expect(items[0].actor).toBeDefined();
      expect(items[0].actor!.id).toBe(actorUserId);
      expect(items[0].actor!.displayName).toBe('Actor User');
      expect(items[0].type).toBe('follow');
      expect(items[0].isRead).toBe(false);
      expect(items[0].createdAt).toBeDefined();
    });

    it('should respect offset for pagination', async () => {
      for (let i = 0; i < 3; i++) {
        await repository.createNotification(
          testUserId,
          'follow',
          actorUserId,
          'user',
          testUserId,
          `Notification ${i}`,
        );
      }

      const page2 = await repository.getNotifications(testUserId, 2, 2, false);
      expect(page2).toHaveLength(1);
    });

    it('should filter to unread only when unreadOnly is true', async () => {
      const n1 = await repository.createNotification(
        testUserId,
        'follow',
        actorUserId,
        'user',
        testUserId,
        'Unread notification',
      );
      await repository.createNotification(
        testUserId,
        'comment',
        actorUserId,
        'character',
        '00000000-0000-0000-0000-000000000001',
        'Read notification',
      );

      // Mark second as read
      await repository.markAsRead(
        (await repository.getNotifications(testUserId, 10, 0, false))
          .find((n) => n.message === 'Read notification')!.id,
        testUserId,
      );

      const unread = await repository.getNotifications(testUserId, 10, 0, true);
      expect(unread).toHaveLength(1);
      expect(unread[0].message).toBe('Unread notification');
    });

    it('should order by createdAt descending', async () => {
      await repository.createNotification(
        testUserId, 'follow', actorUserId, 'user', testUserId, 'First',
      );
      await repository.createNotification(
        testUserId, 'comment', actorUserId, 'character', '00000000-0000-0000-0000-000000000002', 'Second',
      );

      const items = await repository.getNotifications(testUserId, 10, 0, false);
      expect(items[0].message).toBe('Second');
      expect(items[1].message).toBe('First');
    });
  });

  describe('getUnreadCount', () => {
    it('should return count of unread notifications', async () => {
      await repository.createNotification(
        testUserId, 'follow', actorUserId, 'user', testUserId, 'N1',
      );
      await repository.createNotification(
        testUserId, 'comment', actorUserId, 'character', '00000000-0000-0000-0000-000000000002', 'N2',
      );

      const count = await repository.getUnreadCount(testUserId);
      expect(count).toBe(2);
    });

    it('should return 0 when all are read', async () => {
      await repository.createNotification(
        testUserId, 'follow', actorUserId, 'user', testUserId, 'N1',
      );
      await repository.markAllAsRead(testUserId);

      const count = await repository.getUnreadCount(testUserId);
      expect(count).toBe(0);
    });
  });

  describe('markAsRead', () => {
    it('should set isRead to true', async () => {
      const notification = await repository.createNotification(
        testUserId, 'follow', actorUserId, 'user', testUserId, 'Test',
      );

      const result = await repository.markAsRead(notification.id, testUserId);
      expect(result).toBe(true);

      const items = await repository.getNotifications(testUserId, 10, 0, false);
      const updated = items.find((n) => n.id === notification.id);
      expect(updated!.isRead).toBe(true);
    });

    it('should return false for wrong userId', async () => {
      const notification = await repository.createNotification(
        testUserId, 'follow', actorUserId, 'user', testUserId, 'Test',
      );

      const result = await repository.markAsRead(notification.id, actorUserId);
      expect(result).toBe(false);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all unread as read and return count', async () => {
      await repository.createNotification(
        testUserId, 'follow', actorUserId, 'user', testUserId, 'N1',
      );
      await repository.createNotification(
        testUserId, 'comment', actorUserId, 'character', '00000000-0000-0000-0000-000000000002', 'N2',
      );
      await repository.createNotification(
        testUserId, 'reply', actorUserId, 'comment', '00000000-0000-0000-0000-000000000003', 'N3',
      );

      // Mark one as already read
      const items = await repository.getNotifications(testUserId, 10, 0, false);
      await repository.markAsRead(items[0].id, testUserId);

      const count = await repository.markAllAsRead(testUserId);
      expect(count).toBe(2);

      const unreadCount = await repository.getUnreadCount(testUserId);
      expect(unreadCount).toBe(0);
    });

    it('should return 0 when no unread notifications', async () => {
      const count = await repository.markAllAsRead(testUserId);
      expect(count).toBe(0);
    });
  });

  describe('deleteNotification', () => {
    it('should delete the notification record', async () => {
      const notification = await repository.createNotification(
        testUserId, 'follow', actorUserId, 'user', testUserId, 'Test',
      );

      const result = await repository.deleteNotification(notification.id, testUserId);
      expect(result).toBe(true);

      const items = await repository.getNotifications(testUserId, 10, 0, false);
      expect(items.find((n) => n.id === notification.id)).toBeUndefined();
    });

    it('should return false for wrong userId', async () => {
      const notification = await repository.createNotification(
        testUserId, 'follow', actorUserId, 'user', testUserId, 'Test',
      );

      const result = await repository.deleteNotification(notification.id, actorUserId);
      expect(result).toBe(false);

      // Notification should still exist
      const items = await repository.getNotifications(testUserId, 10, 0, false);
      expect(items.find((n) => n.id === notification.id)).toBeDefined();
    });
  });
});