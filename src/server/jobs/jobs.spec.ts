/**
 * Tests for scheduled job registration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchedulerService } from '../services/scheduler.service';
import { registerJobs } from './index';

const { mockJobsLoggerInfo } = vi.hoisted(() => ({
  mockJobsLoggerInfo: vi.fn(),
}));

vi.mock('../services/logger.service', () => ({
  logger: {
    child: () => ({
      info: mockJobsLoggerInfo,
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// Mock dependencies
vi.mock('../services/gdpr.service', () => ({
  gdprService: {
    processExpiredDeletions: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../services/audit.service', () => ({
  auditService: {
    deleteOlderThan: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../../db/repositories/password-reset.repository', () => ({
  passwordResetRepository: {
    deleteExpired: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../../db/repositories/webhook.repository', () => ({
  webhookRepository: {
    deleteOldDeliveries: vi.fn().mockResolvedValue(0),
  },
}));

import { gdprService } from '../services/gdpr.service';
import { auditService } from '../services/audit.service';
import { passwordResetRepository } from '../../db/repositories/password-reset.repository';
import { webhookRepository } from '../../db/repositories/webhook.repository';

describe('registerJobs', () => {
  let scheduler: SchedulerService;

  beforeEach(() => {
    scheduler = new SchedulerService();
  });

  it('should register all 4 jobs', () => {
    registerJobs(scheduler);
    const jobs = scheduler.listJobs();
    expect(jobs).toHaveLength(4);
    const names = jobs.map((j) => j.name);
    expect(names).toContain('gdpr-deletion');
    expect(names).toContain('audit-retention');
    expect(names).toContain('token-cleanup');
    expect(names).toContain('webhook-cleanup');
  });

  it('gdpr-deletion job calls processExpiredDeletions', async () => {
    registerJobs(scheduler);
    await scheduler.runNow('gdpr-deletion');
    expect(gdprService.processExpiredDeletions).toHaveBeenCalledOnce();
  });

  it('audit-retention job calls deleteOlderThan with system tenant', async () => {
    registerJobs(scheduler);
    await scheduler.runNow('audit-retention');
    expect(auditService.deleteOlderThan).toHaveBeenCalledOnce();
    expect(auditService.deleteOlderThan).toHaveBeenCalledWith('system', expect.any(Date));
  });

  it('token-cleanup job calls deleteExpired', async () => {
    registerJobs(scheduler);
    await scheduler.runNow('token-cleanup');
    expect(passwordResetRepository.deleteExpired).toHaveBeenCalledOnce();
  });

  it('webhook-cleanup job calls deleteOldDeliveries', async () => {
    registerJobs(scheduler);
    await scheduler.runNow('webhook-cleanup');
    expect(webhookRepository.deleteOldDeliveries).toHaveBeenCalledOnce();
    expect(webhookRepository.deleteOldDeliveries).toHaveBeenCalledWith(expect.any(Date));
  });

  it('gdpr-deletion logs when count > 0', async () => {
    vi.mocked(gdprService.processExpiredDeletions).mockResolvedValueOnce(3);
    registerJobs(scheduler);
    await scheduler.runNow('gdpr-deletion');
    expect(mockJobsLoggerInfo).toHaveBeenCalledWith('Deleted expired accounts', { job: 'gdpr-deletion', count: 3 });
  });

  it('jobs have correct intervals', () => {
    registerJobs(scheduler);
    const jobs = scheduler.listJobs();
    const byName = Object.fromEntries(jobs.map((j) => [j.name, j]));
    expect(byName['gdpr-deletion'].intervalMs).toBe(60 * 60 * 1000);         // 1 hour
    expect(byName['audit-retention'].intervalMs).toBe(24 * 60 * 60 * 1000);  // 1 day
    expect(byName['token-cleanup'].intervalMs).toBe(6 * 60 * 60 * 1000);     // 6 hours
    expect(byName['webhook-cleanup'].intervalMs).toBe(24 * 60 * 60 * 1000);  // 1 day
  });
});
