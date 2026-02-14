/**
 * Scheduled Job Registration
 *
 * Registers periodic cleanup and maintenance jobs with the scheduler.
 */

import type { SchedulerService } from '../services/scheduler.service';
import { gdprService } from '../services/gdpr.service';
import { auditService } from '../services/audit.service';
import { passwordResetRepository } from '../../db/repositories/password-reset.repository';
import { webhookRepository } from '../../db/repositories/webhook.repository';

const ONE_HOUR = 60 * 60 * 1000;
const SIX_HOURS = 6 * ONE_HOUR;
const ONE_DAY = 24 * ONE_HOUR;

export function registerJobs(scheduler: SchedulerService): void {
  scheduler.register('gdpr-deletion', async () => {
    const count = await gdprService.processExpiredDeletions();
    if (count > 0) console.log(`[Job:gdpr-deletion] Deleted ${count} expired accounts`);
  }, ONE_HOUR);

  scheduler.register('audit-retention', async () => {
    const cutoff = new Date(Date.now() - 90 * ONE_DAY);
    const count = await auditService.deleteOlderThan('system', cutoff);
    if (count > 0) console.log(`[Job:audit-retention] Deleted ${count} old audit logs`);
  }, ONE_DAY);

  scheduler.register('token-cleanup', async () => {
    const count = await passwordResetRepository.deleteExpired();
    if (count > 0) console.log(`[Job:token-cleanup] Deleted ${count} expired tokens`);
  }, SIX_HOURS);

  scheduler.register('webhook-cleanup', async () => {
    const cutoff = new Date(Date.now() - 30 * ONE_DAY);
    const count = await webhookRepository.deleteOldDeliveries(cutoff);
    if (count > 0) console.log(`[Job:webhook-cleanup] Deleted ${count} old deliveries`);
  }, ONE_DAY);
}
