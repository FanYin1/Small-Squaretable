/**
 * Notification Digest Job
 *
 * Sends daily/weekly email digests to users who have opted in
 * via their notification preferences.
 */

import { db } from '@db/index';
import { notifications } from '@db/schema/social';
import { notificationPreferences } from '@db/schema/notification-preferences';
import { users } from '@db/schema/users';
import { eq, and, gte } from 'drizzle-orm';
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

    const filtered = userNotifs.filter(n => types.includes(n.type));
    if (filtered.length === 0) continue;

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
