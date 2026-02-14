/**
 * SchedulerService unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SchedulerService } from './scheduler.service';

describe('SchedulerService', () => {
  let scheduler: SchedulerService;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new SchedulerService();
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
  });

  describe('register + start', () => {
    it('should run a job on its interval', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      scheduler.register('cleanup', handler, 5000);
      scheduler.start();

      // Not called immediately
      expect(handler).not.toHaveBeenCalled();

      // Advance past one interval
      await vi.advanceTimersByTimeAsync(5000);
      expect(handler).toHaveBeenCalledTimes(1);

      // Advance past another interval
      await vi.advanceTimersByTimeAsync(5000);
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('status tracking', () => {
    it('should track lastRunAt and success status after execution', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      scheduler.register('metrics', handler, 1000);
      scheduler.start();

      const before = scheduler.getJobStatus('metrics');
      expect(before?.lastRunAt).toBeNull();
      expect(before?.lastStatus).toBe('pending');
      expect(before?.runCount).toBe(0);

      await vi.advanceTimersByTimeAsync(1000);

      const after = scheduler.getJobStatus('metrics');
      expect(after?.lastRunAt).toBeInstanceOf(Date);
      expect(after?.lastStatus).toBe('success');
      expect(after?.lastError).toBeNull();
      expect(after?.runCount).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should handle job failures gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const handler = vi.fn().mockRejectedValue(new Error('db connection lost'));
      scheduler.register('sync', handler, 2000);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(2000);

      const status = scheduler.getJobStatus('sync');
      expect(status?.lastStatus).toBe('error');
      expect(status?.lastError).toBe('db connection lost');
      expect(status?.runCount).toBe(1);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should recover on subsequent successful runs', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const handler = vi.fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue(undefined);
      scheduler.register('retry-job', handler, 1000);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1000);
      expect(scheduler.getJobStatus('retry-job')?.lastStatus).toBe('error');

      await vi.advanceTimersByTimeAsync(1000);
      expect(scheduler.getJobStatus('retry-job')?.lastStatus).toBe('success');
      expect(scheduler.getJobStatus('retry-job')?.lastError).toBeNull();
      expect(scheduler.getJobStatus('retry-job')?.runCount).toBe(2);

      consoleSpy.mockRestore();
    });
  });

  describe('listJobs', () => {
    it('should list all registered jobs', () => {
      scheduler.register('job-a', vi.fn().mockResolvedValue(undefined), 1000);
      scheduler.register('job-b', vi.fn().mockResolvedValue(undefined), 5000);

      const jobs = scheduler.listJobs();
      expect(jobs).toHaveLength(2);
      expect(jobs.map((j) => j.name).sort()).toEqual(['job-a', 'job-b']);
      expect(jobs[0].intervalMs).toBeDefined();
    });

    it('should return copies, not references', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      scheduler.register('copy-test', handler, 1000);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1000);

      const list = scheduler.listJobs();
      const item = list.find((j) => j.name === 'copy-test')!;
      item.runCount = 999;

      const fresh = scheduler.getJobStatus('copy-test');
      expect(fresh?.runCount).toBe(1);
    });
  });

  describe('runNow', () => {
    it('should allow manual trigger via runNow', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      scheduler.register('manual', handler, 60000);
      // Not started — no interval running

      await scheduler.runNow('manual');

      expect(handler).toHaveBeenCalledTimes(1);
      const status = scheduler.getJobStatus('manual');
      expect(status?.lastStatus).toBe('success');
      expect(status?.runCount).toBe(1);
    });

    it('should be a no-op for unknown job names', async () => {
      // Should not throw
      await expect(scheduler.runNow('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('stop', () => {
    it('should clear all intervals', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      scheduler.register('stoppable', handler, 1000);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1000);
      expect(handler).toHaveBeenCalledTimes(1);

      scheduler.stop();

      await vi.advanceTimersByTimeAsync(5000);
      // Should not have been called again after stop
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('getJobStatus', () => {
    it('should return null for unknown job', () => {
      expect(scheduler.getJobStatus('unknown')).toBeNull();
    });
  });
});
