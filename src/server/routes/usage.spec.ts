import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { usageRoutes } from './usage';
import { errorHandler } from '../middleware/error-handler';

// Mock the usage service
vi.mock('../services/usage.service', () => ({
  usageService: {
    getUsageStats: vi.fn(),
  },
}));

// Mock the feature service
vi.mock('../services/feature.service', () => ({
  featureService: {
    checkQuota: vi.fn(),
  },
}));

// Mock the auth middleware
vi.mock('../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    c.set('user', {
      id: 'user_123',
      tenantId: 'tenant_123',
      email: 'test@example.com',
    });
    await next();
  },
}));

describe('Usage Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.onError(errorHandler);
    app.route('/usage', usageRoutes);
    vi.clearAllMocks();
  });

  describe('GET /usage/stats', () => {
    it('should return usage statistics for authenticated user', async () => {
      const { usageService } = await import('../services/usage.service');
      const mockStats = {
        period: '2024-01',
        usage: {
          llm_tokens: 5000,
          messages: 100,
          images: 10,
          api_calls: 500,
        },
        limits: {
          llm_tokens: 100000,
          messages: 1000,
          images: 100,
          api_calls: 10000,
        },
      };

      vi.mocked(usageService.getUsageStats).mockResolvedValue(mockStats);

      const res = await app.request('/usage/stats', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockStats);
      expect(usageService.getUsageStats).toHaveBeenCalledWith('tenant_123');
    });

    it('should reject unauthenticated requests', async () => {
      const res = await app.request('/usage/stats');

      expect(res.status).toBe(401);
    });

    it('should handle service errors', async () => {
      const { usageService } = await import('../services/usage.service');
      vi.mocked(usageService.getUsageStats).mockRejectedValue(
        new Error('Database error')
      );

      const res = await app.request('/usage/stats', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(500);
    });

    it('should include metadata timestamp', async () => {
      const { usageService } = await import('../services/usage.service');
      vi.mocked(usageService.getUsageStats).mockResolvedValue({
        period: '2024-01',
        usage: {},
        limits: {},
      } as any);

      const res = await app.request('/usage/stats', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      const data = await res.json();
      expect(data.meta).toBeDefined();
      expect(data.meta.timestamp).toBeDefined();
      expect(new Date(data.meta.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('GET /usage/quota', () => {
    it('should return quota information for all resource types', async () => {
      const { featureService } = await import('../services/feature.service');

      const mockQuotas = {
        messages: { used: 50, limit: 1000, remaining: 950, percentage: 5 },
        llm_tokens: { used: 5000, limit: 100000, remaining: 95000, percentage: 5 },
        images: { used: 5, limit: 100, remaining: 95, percentage: 5 },
        api_calls: { used: 200, limit: 10000, remaining: 9800, percentage: 2 },
      };

      vi.mocked(featureService.checkQuota)
        .mockResolvedValueOnce(mockQuotas.messages)
        .mockResolvedValueOnce(mockQuotas.llm_tokens)
        .mockResolvedValueOnce(mockQuotas.images)
        .mockResolvedValueOnce(mockQuotas.api_calls);

      const res = await app.request('/usage/quota', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockQuotas);

      expect(featureService.checkQuota).toHaveBeenCalledTimes(4);
      expect(featureService.checkQuota).toHaveBeenCalledWith('tenant_123', 'messages');
      expect(featureService.checkQuota).toHaveBeenCalledWith('tenant_123', 'llm_tokens');
      expect(featureService.checkQuota).toHaveBeenCalledWith('tenant_123', 'images');
      expect(featureService.checkQuota).toHaveBeenCalledWith('tenant_123', 'api_calls');
    });

    it('should reject unauthenticated requests', async () => {
      const res = await app.request('/usage/quota');

      expect(res.status).toBe(401);
    });

    it('should handle service errors', async () => {
      const { featureService } = await import('../services/feature.service');
      vi.mocked(featureService.checkQuota).mockRejectedValue(
        new Error('Database error')
      );

      const res = await app.request('/usage/quota', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(500);
    });

    it('should fetch all quotas in parallel', async () => {
      const { featureService } = await import('../services/feature.service');
      const startTimes: number[] = [];

      vi.mocked(featureService.checkQuota).mockImplementation(async () => {
        startTimes.push(Date.now());
        await new Promise(resolve => setTimeout(resolve, 10));
        return { used: 0, limit: 1000, remaining: 1000, percentage: 0 };
      });

      await app.request('/usage/quota', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      // All calls should start at roughly the same time (parallel execution)
      const timeDiffs = startTimes.slice(1).map((time, i) => time - startTimes[i]);
      expect(Math.max(...timeDiffs)).toBeLessThan(5); // Should all start within 5ms
    });

    it('should include metadata timestamp', async () => {
      const { featureService } = await import('../services/feature.service');
      vi.mocked(featureService.checkQuota).mockResolvedValue({
        used: 0,
        limit: 1000,
        remaining: 1000,
        percentage: 0,
      });

      const res = await app.request('/usage/quota', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      const data = await res.json();
      expect(data.meta).toBeDefined();
      expect(data.meta.timestamp).toBeDefined();
      expect(new Date(data.meta.timestamp)).toBeInstanceOf(Date);
    });

    it('should handle quota near limit', async () => {
      const { featureService } = await import('../services/feature.service');

      const nearLimitQuota = { used: 950, limit: 1000, remaining: 50, percentage: 95 };
      vi.mocked(featureService.checkQuota).mockResolvedValue(nearLimitQuota);

      const res = await app.request('/usage/quota', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.messages.percentage).toBe(95);
      expect(data.data.messages.remaining).toBe(50);
    });

    it('should handle quota exceeded', async () => {
      const { featureService } = await import('../services/feature.service');

      const exceededQuota = { used: 1100, limit: 1000, remaining: -100, percentage: 110 };
      vi.mocked(featureService.checkQuota).mockResolvedValue(exceededQuota);

      const res = await app.request('/usage/quota', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.messages.used).toBeGreaterThan(data.data.messages.limit);
    });

    it('should handle unlimited quota', async () => {
      const { featureService } = await import('../services/feature.service');

      const unlimitedQuota = { used: 5000, limit: -1, remaining: -1, percentage: 0 };
      vi.mocked(featureService.checkQuota).mockResolvedValue(unlimitedQuota);

      const res = await app.request('/usage/quota', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.messages.limit).toBe(-1);
    });
  });

  describe('Tenant Isolation', () => {
    it('should return usage for correct tenant', async () => {
      const { usageService } = await import('../services/usage.service');

      vi.mocked(usageService.getUsageStats).mockResolvedValue({
        period: '2024-01',
        usage: {},
        limits: {},
      } as any);

      // Mock different tenants
      const mockAuth = (tenantId: string) => async (c: any, next: any) => {
        c.set('user', {
          id: `user_${tenantId}`,
          tenantId,
          email: `user@${tenantId}.com`,
        });
        await next();
      };

      const app1 = new Hono();
      app1.use('/*', mockAuth('tenant_1'));
      app1.route('/usage', usageRoutes);

      const app2 = new Hono();
      app2.use('/*', mockAuth('tenant_2'));
      app2.route('/usage', usageRoutes);

      await app1.request('/usage/stats');
      expect(usageService.getUsageStats).toHaveBeenCalledWith('tenant_1');

      vi.clearAllMocks();

      await app2.request('/usage/stats');
      expect(usageService.getUsageStats).toHaveBeenCalledWith('tenant_2');
    });

    it('should not leak quota information between tenants', async () => {
      const { featureService } = await import('../services/feature.service');
      const quotaCalls: string[] = [];

      vi.mocked(featureService.checkQuota).mockImplementation(async (tenantId) => {
        quotaCalls.push(tenantId);
        return { used: 0, limit: 1000, remaining: 1000, percentage: 0 };
      });

      const mockAuth = (tenantId: string) => async (c: any, next: any) => {
        c.set('user', {
          id: `user_${tenantId}`,
          tenantId,
          email: `user@${tenantId}.com`,
        });
        await next();
      };

      const app1 = new Hono();
      app1.use('/*', mockAuth('tenant_1'));
      app1.route('/usage', usageRoutes);

      await app1.request('/usage/quota');

      // All 4 quota checks should be for tenant_1
      expect(quotaCalls).toEqual(['tenant_1', 'tenant_1', 'tenant_1', 'tenant_1']);
    });
  });
});
