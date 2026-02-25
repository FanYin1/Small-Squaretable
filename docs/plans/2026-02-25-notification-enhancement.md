# Iteration 46: Notification System Enhancement (通知系统增强)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Wire up email notification sending (immediate + daily/weekly digests), add notification cleanup job, and add browser push notification support.

**Architecture:** 5 tasks. T1 adds immediate email notifications at creation time. T2 adds a scheduled digest job for daily/weekly batches. T3 adds notification cleanup job. T4 adds browser Web Push support. T5 runs final verification.

**Tech Stack:** TypeScript strict, Vue 3, Hono.js, Drizzle ORM, Vitest, Nodemailer

---

### Task 1: Add immediate email notifications

**Files:**
- Modify: `src/server/services/notification.service.ts`
- Create: `src/server/services/notification-email.service.ts`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. Create `notification-email.service.ts` — a service that sends notification emails:

```ts
import { emailService } from './email.service';
import { logger } from './logger.service';

const emailLogger = logger.child({ module: 'notification-email' });

interface NotificationEmailData {
  recipientEmail: string;
  recipientName: string;
  type: string;
  message: string;
  actorName?: string;
  targetUrl?: string;
}

export class NotificationEmailService {
  async sendImmediateNotification(data: NotificationEmailData): Promise<void> {
    try {
      await emailService.sendMail({
        to: data.recipientEmail,
        subject: `New notification: ${data.message.substring(0, 50)}`,
        html: this.buildNotificationHtml(data),
      });
      emailLogger.info('Sent immediate notification email', { to: data.recipientEmail, type: data.type });
    } catch (error) {
      emailLogger.error('Failed to send notification email', { error: String(error), to: data.recipientEmail });
    }
  }

  async sendDigestEmail(recipientEmail: string, recipientName: string, notifications: Array<{ type: string; message: string; createdAt: string }>): Promise<void> {
    try {
      await emailService.sendMail({
        to: recipientEmail,
        subject: `You have ${notifications.length} new notifications`,
        html: this.buildDigestHtml(recipientName, notifications),
      });
      emailLogger.info('Sent digest email', { to: recipientEmail, count: notifications.length });
    } catch (error) {
      emailLogger.error('Failed to send digest email', { error: String(error), to: recipientEmail });
    }
  }

  private buildNotificationHtml(data: NotificationEmailData): string {
    return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #409eff;">Small Squaretable</h2>
        <p>Hi ${data.recipientName},</p>
        <div style="padding: 16px; background: #f5f7fa; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0; font-size: 15px;">${data.message}</p>
        </div>
        ${data.targetUrl ? `<a href="${data.targetUrl}" style="color: #409eff;">View details</a>` : ''}
        <hr style="border: none; border-top: 1px solid #ebeef5; margin: 24px 0;" />
        <p style="color: #909399; font-size: 12px;">You can manage your notification preferences in Settings.</p>
      </div>
    `;
  }

  private buildDigestHtml(name: string, notifications: Array<{ type: string; message: string; createdAt: string }>): string {
    const items = notifications.map(n =>
      `<li style="padding: 8px 0; border-bottom: 1px solid #ebeef5;">${n.message} <span style="color: #909399; font-size: 12px;">${new Date(n.createdAt).toLocaleDateString()}</span></li>`
    ).join('');
    return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #409eff;">Small Squaretable</h2>
        <p>Hi ${name}, here's your notification digest:</p>
        <ul style="list-style: none; padding: 0;">${items}</ul>
        <hr style="border: none; border-top: 1px solid #ebeef5; margin: 24px 0;" />
        <p style="color: #909399; font-size: 12px;">You can manage your notification preferences in Settings.</p>
      </div>
    `;
  }
}

export const notificationEmailService = new NotificationEmailService();
```

2. Modify `notification.service.ts` — in the `notify()` method, after creating the notification and sending WebSocket push, check if the user has `email: true` and `emailFrequency: 'immediate'` for this notification type. If so, call `notificationEmailService.sendImmediateNotification()`.

Read the file first. Find the `notify()` method. After the WebSocket broadcast section, add:
```ts
// Send immediate email if preference allows
const prefs = await this.getPreferences(options.userId);
const typePref = prefs.find(p => p.notificationType === options.type);
if (typePref?.email && typePref?.emailFrequency === 'immediate') {
  // Fetch user email
  const user = await db.select({ email: users.email, displayName: users.displayName })
    .from(users).where(eq(users.id, options.userId)).limit(1);
  if (user.length > 0 && user[0].email) {
    notificationEmailService.sendImmediateNotification({
      recipientEmail: user[0].email,
      recipientName: user[0].displayName || 'User',
      type: options.type,
      message: options.message,
    }).catch(() => {}); // fire-and-forget
  }
}
```

Check how `emailService` is imported in the project — read `src/server/services/email.service.ts` to understand the `sendMail` interface.

**Tests:** ~2 tests in `src/server/services/notification-email.service.spec.ts`
- sendImmediateNotification calls emailService.sendMail
- sendDigestEmail builds correct HTML with notification count

Mock `emailService.sendMail` as vi.fn().

**Commit:** `feat(notifications): add immediate email notification sending`

---

### Task 2: Add scheduled digest job

**Files:**
- Create: `src/server/jobs/notification-digest.job.ts`
- Modify: `src/server/jobs/index.ts`

**What to do:**

1. Create `notification-digest.job.ts`:

```ts
import { db } from '../../db';
import { notifications } from '../../db/schema/social';
import { notificationPreferences } from '../../db/schema/notification-preferences';
import { users } from '../../db/schema/users';
import { eq, and, gte, sql } from 'drizzle-orm';
import { notificationEmailService } from '../services/notification-email.service';
import { logger } from '../services/logger.service';

const digestLogger = logger.child({ module: 'notification-digest' });

export async function runNotificationDigest(frequency: 'daily' | 'weekly'): Promise<void> {
  digestLogger.info('Starting notification digest', { frequency });

  const cutoff = new Date();
  if (frequency === 'daily') {
    cutoff.setDate(cutoff.getDate() - 1);
  } else {
    cutoff.setDate(cutoff.getDate() - 7);
  }

  // Find users who have email digest enabled for this frequency
  const prefs = await db.select({
    userId: notificationPreferences.userId,
    notificationType: notificationPreferences.notificationType,
  })
    .from(notificationPreferences)
    .where(and(
      eq(notificationPreferences.email, true),
      eq(notificationPreferences.emailFrequency, frequency),
    ));

  // Group by userId
  const userTypes = new Map<string, string[]>();
  for (const p of prefs) {
    if (!userTypes.has(p.userId)) userTypes.set(p.userId, []);
    userTypes.get(p.userId)!.push(p.notificationType);
  }

  let sentCount = 0;
  for (const [userId, types] of userTypes) {
    // Fetch unread notifications for these types since cutoff
    const userNotifs = await db.select({
      type: notifications.type,
      message: notifications.message,
      createdAt: notifications.createdAt,
    })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        gte(notifications.createdAt, cutoff),
      ))
      .orderBy(notifications.createdAt);

    // Filter to matching types
    const filtered = userNotifs.filter(n => types.includes(n.type));
    if (filtered.length === 0) continue;

    // Get user email
    const user = await db.select({ email: users.email, displayName: users.displayName })
      .from(users).where(eq(users.id, userId)).limit(1);

    if (!user.length || !user[0].email) continue;

    await notificationEmailService.sendDigestEmail(
      user[0].email,
      user[0].displayName || 'User',
      filtered.map(n => ({ type: n.type, message: n.message, createdAt: n.createdAt.toISOString() })),
    );
    sentCount++;
  }

  digestLogger.info('Notification digest complete', { frequency, sentCount });
}
```

2. Register in `src/server/jobs/index.ts`. Read the file first. Add two jobs:
```ts
scheduler.register('notification-digest-daily', '0 9 * * *', () => runNotificationDigest('daily'));
scheduler.register('notification-digest-weekly', '0 9 * 1', () => runNotificationDigest('weekly'));
```

Or follow the existing job registration pattern (it might use `setInterval` instead of cron).

**Tests:** ~1 test in `src/server/jobs/notification-digest.job.spec.ts`
- Sends digest emails to users with matching preferences

**Commit:** `feat(notifications): add scheduled email digest job`

---

### Task 3: Add notification cleanup job

**Files:**
- Create: `src/server/jobs/notification-cleanup.job.ts`
- Modify: `src/server/jobs/index.ts`

**What to do:**

1. Create `notification-cleanup.job.ts`:

```ts
import { db } from '../../db';
import { notifications } from '../../db/schema/social';
import { lt, and, eq } from 'drizzle-orm';
import { logger } from '../services/logger.service';

const cleanupLogger = logger.child({ module: 'notification-cleanup' });

export async function runNotificationCleanup(): Promise<void> {
  cleanupLogger.info('Starting notification cleanup');

  // Delete read notifications older than 30 days
  const readCutoff = new Date();
  readCutoff.setDate(readCutoff.getDate() - 30);

  const readResult = await db.delete(notifications)
    .where(and(
      eq(notifications.isRead, true),
      lt(notifications.createdAt, readCutoff),
    ));

  // Delete all notifications older than 90 days
  const allCutoff = new Date();
  allCutoff.setDate(allCutoff.getDate() - 90);

  const allResult = await db.delete(notifications)
    .where(lt(notifications.createdAt, allCutoff));

  cleanupLogger.info('Notification cleanup complete');
}
```

2. Register in `src/server/jobs/index.ts`:
```ts
scheduler.register('notification-cleanup', 24 * 60 * 60 * 1000, runNotificationCleanup);
```

Follow the existing job registration pattern.

**Tests:** ~1 test in `src/server/jobs/notification-cleanup.job.spec.ts`
- Deletes old read notifications

**Commit:** `feat(notifications): add notification cleanup job`

---

### Task 4: Add browser Web Push support

**Files:**
- Modify: `src/server/routes/notifications.ts`
- Create: `src/client/services/push.service.ts`
- Modify: `src/client/components/notification/NotificationPreferences.vue`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

1. Add a push subscription endpoint to `src/server/routes/notifications.ts`:

```ts
// POST /push-subscription — Save browser push subscription
notificationRoutes.post('/push-subscription', authMiddleware(), async (c) => {
  const user = c.get('user') as { id: string };
  const subscription = await c.req.json();

  // Store subscription in Redis (per user, supports multiple devices)
  const redisClient = await getRedisClient();
  const key = `push:subscriptions:${user.id}`;
  await redisClient.sAdd(key, JSON.stringify(subscription));
  await redisClient.expire(key, 30 * 24 * 60 * 60); // 30 days TTL

  return c.json<ApiResponse>({
    success: true,
    data: null,
    meta: { timestamp: new Date().toISOString() },
  });
});

// DELETE /push-subscription — Remove push subscription
notificationRoutes.delete('/push-subscription', authMiddleware(), async (c) => {
  const user = c.get('user') as { id: string };
  const subscription = await c.req.json();

  const redisClient = await getRedisClient();
  const key = `push:subscriptions:${user.id}`;
  await redisClient.sRem(key, JSON.stringify(subscription));

  return c.json<ApiResponse>({
    success: true,
    data: null,
    meta: { timestamp: new Date().toISOString() },
  });
});
```

2. Create `src/client/services/push.service.ts`:

```ts
import { api } from './api';

export const pushService = {
  async subscribe(): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
      });

      await api.post('/notifications/push-subscription', subscription.toJSON());
      return true;
    } catch {
      return false;
    }
  },

  async unsubscribe(): Promise<boolean> {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api.delete('/notifications/push-subscription', subscription.toJSON());
        await subscription.unsubscribe();
      }
      return true;
    } catch {
      return false;
    }
  },

  async isSubscribed(): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      return !!subscription;
    } catch {
      return false;
    }
  },
};
```

3. In `NotificationPreferences.vue`, add a "Browser Push Notifications" toggle at the top of the preferences dialog. Read the file first.

4. Add i18n keys under `notifications`:
- en-US: `"pushNotifications": "Browser Push Notifications"`, `"pushEnabled": "Push notifications enabled"`, `"pushDisabled": "Push notifications disabled"`, `"pushUnsupported": "Push notifications not supported in this browser"`
- zh-CN: `"pushNotifications": "浏览器推送通知"`, `"pushEnabled": "推送通知已开启"`, `"pushDisabled": "推送通知已关闭"`, `"pushUnsupported": "此浏览器不支持推送通知"`

**Tests:** ~2 tests in `src/server/routes/notification-push.spec.ts`
- Save push subscription returns success
- Delete push subscription returns success

**Commit:** `feat(notifications): add browser Web Push support`

---

### Task 5: Final verification

1. Run `npx vitest run` — expect 1965+ tests passing
2. Run `npx tsc --noEmit` — expect 0 errors

**Commit:** None (verification only).
