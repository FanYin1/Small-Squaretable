/**
 * Admin Jobs Routes Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// Mock scheduler service
vi.mock('../../services/scheduler.service', () => {
  const mockJobs = [
    {
      name: 'cleanup-expired-tokens',
      intervalMs: 3600000,
      lastRunAt: new Date('2026-02-15T10:00:00Z'),
      lastStatus: 'success',
      lastError: null,
      runCount: 5,
    },
    {
      name: 'aggregate-stats',
      intervalMs: 86400000,
      lastRunAt: null,
      lastStatus: 'pending',
      lastError: null,
      runCount: 0,
    },
  ];

  return {
    scheduler: {
      listJobs: vi.fn(() => mockJobs.map((j) => ({ ...j }))),
      getJobStatus: vi.fn((name: string) => {
        const job = mockJobs.find((j) => j.name === name);
        return job ? { ...job } : null;
      }),
      runNow: vi.fn(async () => {}),
    },
  };
});

// Mock auth middleware — admin role
vi.mock('../../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', {
      id: 'admin-123',
      tenantId: 'tenant-123',
      email: 'admin@example.com',
      displayName: 'Admin User',
      avatarUrl: null,
      role: 'admin',
    });
    c.set('tenantId', 'tenant-123');
    return next();
  },
}));

import { adminJobRoutes } from './jobs';
import { scheduler } from '../../services/scheduler.service';

describe('Admin Jobs Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/admin/jobs', adminJobRoutes);
    vi.clearAllMocks();
  });

  describe('GET /jobs', () => {
    it('should return list of all registered jobs', async () => {
      const res = await app.request('/api/v1/admin/jobs');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].name).toBe('cleanup-expired-tokens');
      expect(data.data[1].name).toBe('aggregate-stats');
      expect(scheduler.listJobs).toHaveBeenCalled();
    });

    it('should include meta timestamp', async () => {
      const res = await app.request('/api/v1/admin/jobs');
      const data = await res.json();
      expect(data.meta).toBeDefined();
      expect(data.meta.timestamp).toBeDefined();
    });
  });

  describe('POST /jobs/:name/run', () => {
    it('should trigger a known job and return its status', async () => {
      const res = await app.request('/api/v1/admin/jobs/cleanup-expired-tokens/run', {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('cleanup-expired-tokens');
      expect(scheduler.runNow).toHaveBeenCalledWith('cleanup-expired-tokens');
    });

    it('should return 404 for unknown job', async () => {
      const res = await app.request('/api/v1/admin/jobs/nonexistent-job/run', {
        method: 'POST',
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
      expect(data.error.message).toContain('nonexistent-job');
    });
  });
});
