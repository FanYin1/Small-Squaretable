/**
 * Simple setInterval-based job scheduler service.
 * Runs in the main server process — no persistence, no distributed locking.
 */

import { logger } from './logger.service';

const schedulerLogger = logger.child({ module: 'scheduler' });

export interface JobStatus {
  name: string;
  intervalMs: number;
  lastRunAt: Date | null;
  lastStatus: 'success' | 'error' | 'pending';
  lastError: string | null;
  runCount: number;
}

type JobHandler = () => Promise<void>;

interface RegisteredJob {
  handler: JobHandler;
  intervalMs: number;
  timerId: ReturnType<typeof setInterval> | null;
  status: JobStatus;
}

export class SchedulerService {
  private jobs = new Map<string, RegisteredJob>();

  register(name: string, handler: JobHandler, intervalMs: number): void {
    this.jobs.set(name, {
      handler,
      intervalMs,
      timerId: null,
      status: { name, intervalMs, lastRunAt: null, lastStatus: 'pending', lastError: null, runCount: 0 },
    });
  }

  start(): void {
    for (const [name, job] of this.jobs) {
      job.timerId = setInterval(() => this.executeJob(name), job.intervalMs);
    }
  }

  stop(): void {
    for (const job of this.jobs.values()) {
      if (job.timerId) clearInterval(job.timerId);
      job.timerId = null;
    }
  }

  async runNow(name: string): Promise<void> {
    await this.executeJob(name);
  }

  private async executeJob(name: string): Promise<void> {
    const job = this.jobs.get(name);
    if (!job) return;
    try {
      await job.handler();
      job.status.lastStatus = 'success';
      job.status.lastError = null;
    } catch (err) {
      job.status.lastStatus = 'error';
      job.status.lastError = (err as Error).message;
      schedulerLogger.error(`Job "${name}" failed`, err as Error);
    }
    job.status.lastRunAt = new Date();
    job.status.runCount++;
  }

  getJobStatus(name: string): JobStatus | null {
    return this.jobs.get(name)?.status ?? null;
  }

  listJobs(): JobStatus[] {
    return Array.from(this.jobs.values()).map((j) => ({ ...j.status }));
  }
}

export const scheduler = new SchedulerService();
