import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  trackMessageUsage,
  trackApiCallUsage,
  trackTokenUsage,
  trackImageUsage,
} from './usage-tracking';

// Mock the usage service
vi.mock('../services/usage.service', () => ({
  usageService: {
    trackUsage: vi.fn(),
  },
}));

describe('Usage Tracking Middleware', () => {
  let app: Hono;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    app = new Hono();
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('trackMessageUsage', () => {
    it('should track message usage when user is authenticated', async () => {
      const { usageService } = await import('../services/usage.service');

      app.use('/*', async (c, next) => {
        c.set('user', { id: 'user_123', tenantId: 'tenant_123', email: 'test@example.com' });
        await next();
      });
      app.use('/*', trackMessageUsage);
      app.post('/messages', (c) => c.json({ success: true }));

      await app.request('/messages', { method: 'POST' });

      expect(usageService.trackUsage).toHaveBeenCalledWith('tenant_123', 'messages', 1);
    });

    it('should not track usage when user is not authenticated', async () => {
      const { usageService } = await import('../services/usage.service');

      app.use('/*', trackMessageUsage);
      app.post('/messages', (c) => c.json({ success: true }));

      await app.request('/messages', { method: 'POST' });

      expect(usageService.trackUsage).not.toHaveBeenCalled();
    });

    it('should not track usage when user has no tenantId', async () => {
      const { usageService } = await import('../services/usage.service');

      app.use('/*', async (c, next) => {
        c.set('user', { id: 'user_123', email: 'test@example.com' } as any);
        await next();
      });
      app.use('/*', trackMessageUsage);
      app.post('/messages', (c) => c.json({ success: true }));

      await app.request('/messages', { method: 'POST' });

      expect(usageService.trackUsage).not.toHaveBeenCalled();
    });

    it('should not affect response when tracking fails', async () => {
      const { usageService } = await import('../services/usage.service');
      vi.mocked(usageService.trackUsage).mockRejectedValue(new Error('Database error'));

      app.use('/*', async (c, next) => {
        c.set('user', { id: 'user_123', tenantId: 'tenant_123', email: 'test@example.com' });
        await next();
      });
      app.use('/*', trackMessageUsage);
      app.post('/messages', (c) => c.json({ success: true }));

      const res = await app.request('/messages', { method: 'POST' });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to track message usage:',
        expect.any(Error)
      );
    });

    it('should track usage after request completes', async () => {
      const { usageService } = await import('../services/usage.service');
      const callOrder: string[] = [];

      vi.mocked(usageService.trackUsage).mockImplementation(async () => {
        callOrder.push('track');
      });

      app.use('/*', async (c, next) => {
        c.set('user', { id: 'user_123', tenantId: 'tenant_123', email: 'test@example.com' });
        await next();
      });
      app.use('/*', trackMessageUsage);
      app.post('/messages', (c) => {
        callOrder.push('handler');
        return c.json({ success: true });
      });

      await app.request('/messages', { method: 'POST' });

      expect(callOrder).toEqual(['handler', 'track']);
    });
  });

  describe('trackApiCallUsage', () => {
    it('should track API call usage when user is authenticated', async () => {
      const { usageService } = await import('../services/usage.service');

      app.use('/*', async (c, next) => {
        c.set('user', { id: 'user_123', tenantId: 'tenant_123', email: 'test@example.com' });
        await next();
      });
      app.use('/*', trackApiCallUsage);
      app.get('/api/data', (c) => c.json({ data: [] }));

      await app.request('/api/data');

      expect(usageService.trackUsage).toHaveBeenCalledWith('tenant_123', 'api_calls', 1);
    });

    it('should not track usage when user is not authenticated', async () => {
      const { usageService } = await import('../services/usage.service');

      app.use('/*', trackApiCallUsage);
      app.get('/api/data', (c) => c.json({ data: [] }));

      await app.request('/api/data');

      expect(usageService.trackUsage).not.toHaveBeenCalled();
    });

    it('should handle tracking errors gracefully', async () => {
      const { usageService } = await import('../services/usage.service');
      vi.mocked(usageService.trackUsage).mockRejectedValue(new Error('Tracking failed'));

      app.use('/*', async (c, next) => {
        c.set('user', { id: 'user_123', tenantId: 'tenant_123', email: 'test@example.com' });
        await next();
      });
      app.use('/*', trackApiCallUsage);
      app.get('/api/data', (c) => c.json({ data: [] }));

      const res = await app.request('/api/data');

      expect(res.status).toBe(200);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to track API call usage:',
        expect.any(Error)
      );
    });
  });

  describe('trackTokenUsage', () => {
    it('should track token usage with specified count', async () => {
      const { usageService } = await import('../services/usage.service');

      app.use('/*', async (c, next) => {
        c.set('user', { id: 'user_123', tenantId: 'tenant_123', email: 'test@example.com' });
        await next();
      });
      app.use('/*', trackTokenUsage(1500));
      app.post('/llm/chat', (c) => c.json({ response: 'Hello' }));

      await app.request('/llm/chat', { method: 'POST' });

      expect(usageService.trackUsage).toHaveBeenCalledWith('tenant_123', 'llm_tokens', 1500);
    });

    it('should track different token counts', async () => {
      const { usageService } = await import('../services/usage.service');

      app.use('/*', async (c, next) => {
        c.set('user', { id: 'user_123', tenantId: 'tenant_123', email: 'test@example.com' });
        await next();
      });
      app.use('/small', trackTokenUsage(100));
      app.use('/large', trackTokenUsage(5000));
      app.post('/small', (c) => c.json({ response: 'Hi' }));
      app.post('/large', (c) => c.json({ response: 'Long response...' }));

      await app.request('/small', { method: 'POST' });
      expect(usageService.trackUsage).toHaveBeenCalledWith('tenant_123', 'llm_tokens', 100);

      vi.clearAllMocks();

      await app.request('/large', { method: 'POST' });
      expect(usageService.trackUsage).toHaveBeenCalledWith('tenant_123', 'llm_tokens', 5000);
    });

    it('should not track when user is not authenticated', async () => {
      const { usageService } = await import('../services/usage.service');

      app.use('/*', trackTokenUsage(1000));
      app.post('/llm/chat', (c) => c.json({ response: 'Hello' }));

      await app.request('/llm/chat', { method: 'POST' });

      expect(usageService.trackUsage).not.toHaveBeenCalled();
    });

    it('should handle tracking errors gracefully', async () => {
      const { usageService } = await import('../services/usage.service');
      vi.mocked(usageService.trackUsage).mockRejectedValue(new Error('Tracking failed'));

      app.use('/*', async (c, next) => {
        c.set('user', { id: 'user_123', tenantId: 'tenant_123', email: 'test@example.com' });
        await next();
      });
      app.use('/*', trackTokenUsage(2000));
      app.post('/llm/chat', (c) => c.json({ response: 'Hello' }));

      const res = await app.request('/llm/chat', { method: 'POST' });

      expect(res.status).toBe(200);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to track token usage:',
        expect.any(Error)
      );
    });
  });

  describe('trackImageUsage', () => {
    it('should track image usage when user is authenticated', async () => {
      const { usageService } = await import('../services/usage.service');

      app.use('/*', async (c, next) => {
        c.set('user', { id: 'user_123', tenantId: 'tenant_123', email: 'test@example.com' });
        await next();
      });
      app.use('/*', trackImageUsage);
      app.post('/images/generate', (c) => c.json({ imageUrl: 'https://example.com/image.png' }));

      await app.request('/images/generate', { method: 'POST' });

      expect(usageService.trackUsage).toHaveBeenCalledWith('tenant_123', 'images', 1);
    });

    it('should not track usage when user is not authenticated', async () => {
      const { usageService } = await import('../services/usage.service');

      app.use('/*', trackImageUsage);
      app.post('/images/generate', (c) => c.json({ imageUrl: 'https://example.com/image.png' }));

      await app.request('/images/generate', { method: 'POST' });

      expect(usageService.trackUsage).not.toHaveBeenCalled();
    });

    it('should handle tracking errors gracefully', async () => {
      const { usageService } = await import('../services/usage.service');
      vi.mocked(usageService.trackUsage).mockRejectedValue(new Error('Tracking failed'));

      app.use('/*', async (c, next) => {
        c.set('user', { id: 'user_123', tenantId: 'tenant_123', email: 'test@example.com' });
        await next();
      });
      app.use('/*', trackImageUsage);
      app.post('/images/generate', (c) => c.json({ imageUrl: 'https://example.com/image.png' }));

      const res = await app.request('/images/generate', { method: 'POST' });

      expect(res.status).toBe(200);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to track image usage:',
        expect.any(Error)
      );
    });
  });

  describe('Tenant Isolation', () => {
    it('should track usage for correct tenant', async () => {
      const { usageService } = await import('../services/usage.service');

      app.use('/*', async (c, next) => {
        const path = new URL(c.req.url).pathname;
        if (path === '/tenant1') {
          c.set('user', { id: 'user_1', tenantId: 'tenant_1', email: 'user1@example.com' });
        } else {
          c.set('user', { id: 'user_2', tenantId: 'tenant_2', email: 'user2@example.com' });
        }
        await next();
      });
      app.use('/*', trackMessageUsage);
      app.post('/tenant1', (c) => c.json({ success: true }));
      app.post('/tenant2', (c) => c.json({ success: true }));

      await app.request('/tenant1', { method: 'POST' });
      expect(usageService.trackUsage).toHaveBeenCalledWith('tenant_1', 'messages', 1);

      vi.clearAllMocks();

      await app.request('/tenant2', { method: 'POST' });
      expect(usageService.trackUsage).toHaveBeenCalledWith('tenant_2', 'messages', 1);
    });

    it('should not leak usage between tenants', async () => {
      const { usageService } = await import('../services/usage.service');
      const trackingCalls: Array<{ tenantId: string; resourceType: string }> = [];

      vi.mocked(usageService.trackUsage).mockImplementation(async (tenantId, resourceType) => {
        trackingCalls.push({ tenantId, resourceType: resourceType as string });
      });

      app.use('/*', async (c, next) => {
        const path = new URL(c.req.url).pathname;
        if (path === '/tenant1') {
          c.set('user', { id: 'user_1', tenantId: 'tenant_1', email: 'user1@example.com' });
        } else {
          c.set('user', { id: 'user_2', tenantId: 'tenant_2', email: 'user2@example.com' });
        }
        await next();
      });
      app.use('/*', trackMessageUsage);
      app.post('/tenant1', (c) => c.json({ success: true }));
      app.post('/tenant2', (c) => c.json({ success: true }));

      await app.request('/tenant1', { method: 'POST' });
      await app.request('/tenant2', { method: 'POST' });

      expect(trackingCalls).toEqual([
        { tenantId: 'tenant_1', resourceType: 'messages' },
        { tenantId: 'tenant_2', resourceType: 'messages' },
      ]);
    });
  });
});
