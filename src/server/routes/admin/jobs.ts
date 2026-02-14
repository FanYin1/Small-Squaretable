/**
 * Admin Scheduled Jobs Routes
 *
 * Provides endpoints to list and manually trigger scheduled jobs.
 */

import { Hono } from 'hono';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { scheduler } from '../../services/scheduler.service';
import type { ApiResponse } from '../../../types/api';

export const adminJobRoutes = new Hono();

// List all registered jobs
adminJobRoutes.get('/', authMiddleware(), requireRole('admin'), async (c) => {
  const jobs = scheduler.listJobs();
  return c.json<ApiResponse>({
    success: true,
    data: jobs,
    meta: { timestamp: new Date().toISOString() },
  });
});

// Manually trigger a job
adminJobRoutes.post('/:name/run', authMiddleware(), requireRole('admin'), async (c) => {
  const name = c.req.param('name');
  const status = scheduler.getJobStatus(name);
  if (!status) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: `Job "${name}" not found` },
        meta: { timestamp: new Date().toISOString() },
      },
      404,
    );
  }
  await scheduler.runNow(name);
  return c.json<ApiResponse>({
    success: true,
    data: scheduler.getJobStatus(name),
    meta: { timestamp: new Date().toISOString() },
  });
});
