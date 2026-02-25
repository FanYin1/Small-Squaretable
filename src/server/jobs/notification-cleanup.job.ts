/**
 * Notification Cleanup Job
 *
 * Deletes stale notifications to keep the table lean:
 *  - Read notifications older than 30 days
 *  - All notifications older than 90 days
 */

import { db } from '@db/index';
import { notifications } from '@db/schema/social';
import { lt, and, eq } from 'drizzle-orm';
import { logger } from '../services/logger.service';

const cleanupLogger = logger.child({ module: 'notification-cleanup' });

export async function runNotificationCleanup(): Promise<void> {
  cleanupLogger.info('Starting notification cleanup');

  // Delete read notifications older than 30 days
  const readCutoff = new Date();
  readCutoff.setDate(readCutoff.getDate() - 30);

  await db.delete(notifications)
    .where(and(
      eq(notifications.isRead, true),
      lt(notifications.createdAt, readCutoff),
    ));

  // Delete all notifications older than 90 days
  const allCutoff = new Date();
  allCutoff.setDate(allCutoff.getDate() - 90);

  await db.delete(notifications)
    .where(lt(notifications.createdAt, allCutoff));

  cleanupLogger.info('Notification cleanup complete');
}
