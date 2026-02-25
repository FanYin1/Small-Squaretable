/**
 * Scheduled Job Registration
 *
 * Registers periodic cleanup and maintenance jobs with the scheduler.
 */

import type { SchedulerService } from '../services/scheduler.service';
import { gdprService } from '../services/gdpr.service';
import { logger } from '../services/logger.service';

const jobLogger = logger.child({ module: 'scheduler' });
import { auditService } from '../services/audit.service';
import { passwordResetRepository } from '../../db/repositories/password-reset.repository';
import { webhookRepository } from '../../db/repositories/webhook.repository';
import { memoryConsolidationService } from '../services/memory-consolidation.service';
import { memoryService } from '../services/memory.service';
import { memoryRepository } from '../../db/repositories/memory.repository';
import { runNotificationDigest } from './notification-digest.job';
import { runNotificationCleanup } from './notification-cleanup.job';

const ONE_HOUR = 60 * 60 * 1000;
const SIX_HOURS = 6 * ONE_HOUR;
const ONE_DAY = 24 * ONE_HOUR;
const ONE_WEEK = 7 * ONE_DAY;

export function registerJobs(scheduler: SchedulerService): void {
  scheduler.register('gdpr-deletion', async () => {
    const count = await gdprService.processExpiredDeletions();
    if (count > 0) jobLogger.info('Deleted expired accounts', { job: 'gdpr-deletion', count });
  }, ONE_HOUR);

  scheduler.register('audit-retention', async () => {
    const cutoff = new Date(Date.now() - 90 * ONE_DAY);
    const count = await auditService.deleteOlderThan('system', cutoff);
    if (count > 0) jobLogger.info('Deleted old audit logs', { job: 'audit-retention', count });
  }, ONE_DAY);

  scheduler.register('token-cleanup', async () => {
    const count = await passwordResetRepository.deleteExpired();
    if (count > 0) jobLogger.info('Deleted expired tokens', { job: 'token-cleanup', count });
  }, SIX_HOURS);

  scheduler.register('webhook-cleanup', async () => {
    const cutoff = new Date(Date.now() - 30 * ONE_DAY);
    const count = await webhookRepository.deleteOldDeliveries(cutoff);
    if (count > 0) jobLogger.info('Deleted old deliveries', { job: 'webhook-cleanup', count });
  }, ONE_DAY);

  scheduler.register('memory-consolidation', async () => {
    const result = await memoryConsolidationService.consolidateAll();
    if (result.totalConsolidated > 0) {
      jobLogger.info('Memory consolidation complete', {
        job: 'memory-consolidation',
        pairs: result.pairs,
        consolidated: result.totalConsolidated,
      });
    }
  }, ONE_DAY);

  scheduler.register('memory-promotion', async () => {
    const pairs = await memoryRepository.findActiveCharacterUserPairs(5);
    let totalPromoted = 0;
    for (const pair of pairs) {
      const result = await memoryService.promoteSessionMemories(
        pair.characterId, pair.userId
      );
      totalPromoted += result.promoted;
    }
    if (totalPromoted > 0) {
      jobLogger.info('Memory promotion complete', {
        job: 'memory-promotion',
        promoted: totalPromoted,
      });
    }
  }, SIX_HOURS);

  scheduler.register('notification-digest-daily', async () => {
    await runNotificationDigest('daily');
  }, ONE_DAY);

  scheduler.register('notification-digest-weekly', async () => {
    await runNotificationDigest('weekly');
  }, ONE_WEEK);

  scheduler.register('notification-cleanup', async () => {
    await runNotificationCleanup();
  }, ONE_DAY);
}
