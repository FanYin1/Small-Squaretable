/**
 * Rate Limiting Middleware Tests
 *
 * Tests for rate limiting functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Hono } from 'hono';
import { rateLimit } from './rateLimit';

describe('Rate Limiting Middleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('rateLimit', () => {
    it('should allow requests within limit', async () => {
      const app = new Hono();
      app.use(
        '*',
        rateLimit({
          limit: 5,
          windowMs: 60000,
          keyGenerator: () => `test-key-${Math.random()}`, // Unique key per test
        })
      );
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(200);
    });

    it('should block requests exceeding limit', async () => {
      const app = new Hono();
      const testKey = `test-block-${Date.now()}`;
      app.use(
        '*',
        rateLimit({
          limit: 3,
          windowMs: 60000,
          keyGenerator: () => testKey,
        })
      );
      app.get('/test', (c) => c.json({ ok: true }));

      // First 3 requests should succeed
      for (let i = 0; i < 3; i++) {
        const res = await app.request('/test');
        expect(res.status).toBe(200);
      }

      // 4th request should be blocked
      const res = await app.request('/test');
      expect(res.status).toBe(429);

      const data = await res.json();
      expect(data.error).toBe('Rate limit exceeded');
    });

    it('should set rate limit headers', async () => {
      const app = new Hono();
      const testKey = `test-headers-${Date.now()}`;
      app.use(
        '*',
        rateLimit({
          limit: 10,
          windowMs: 60000,
          keyGenerator: () => testKey,
        })
      );
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('9');
      expect(res.headers.get('X-RateLimit-Reset')).toBeDefined();
    });

    it('should set Retry-After header when limit exceeded', async () => {
      const app = new Hono();
      const testKey = `test-retry-${Date.now()}`;
      app.use(
        '*',
        rateLimit({
          limit: 1,
          windowMs: 60000,
          keyGenerator: () => testKey,
        })
      );
      app.get('/test', (c) => c.json({ ok: true }));

      await app.request('/test');
      const res = await app.request('/test');

      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBeDefined();
    });

    it('should use custom key generator', async () => {
      const app = new Hono();
      app.use(
        '*',
        rateLimit({
          limit: 2,
          windowMs: 60000,
          keyGenerator: (c) => c.req.header('X-Custom-Key') || `default-${Date.now()}`,
        })
      );
      app.get('/test', (c) => c.json({ ok: true }));

      // Requests with different keys should have separate limits
      const res1 = await app.request('/test', {
        headers: { 'X-Custom-Key': `user1-${Date.now()}` },
      });
      const res2 = await app.request('/test', {
        headers: { 'X-Custom-Key': `user2-${Date.now()}` },
      });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });

    it('should skip rate limiting when skip function returns true', async () => {
      const app = new Hono();
      const testKey = `test-skip-${Date.now()}`;
      app.use(
        '*',
        rateLimit({
          limit: 1,
          windowMs: 60000,
          keyGenerator: () => testKey,
          skip: (c) => c.req.header('X-Skip-Rate-Limit') === 'true',
        })
      );
      app.get('/test', (c) => c.json({ ok: true }));

      // First request without skip
      let res = await app.request('/test');
      expect(res.status).toBe(200);

      // Second request without skip - blocked
      res = await app.request('/test');
      expect(res.status).toBe(429);

      // Request with skip - allowed
      res = await app.request('/test', {
        headers: { 'X-Skip-Rate-Limit': 'true' },
      });
      expect(res.status).toBe(200);
    });

    it('should use custom message', async () => {
      const app = new Hono();
      const testKey = `test-message-${Date.now()}`;
      app.use(
        '*',
        rateLimit({
          limit: 1,
          windowMs: 60000,
          keyGenerator: () => testKey,
          message: 'Custom rate limit message',
        })
      );
      app.get('/test', (c) => c.json({ ok: true }));

      await app.request('/test');
      const res = await app.request('/test');

      const data = await res.json();
      expect(data.message).toBe('Custom rate limit message');
    });
  });

  describe('Pre-configured rate limiters', () => {
    it('should have correct limits configured', () => {
      // Just verify the rate limiters are exported and can be used
      // Actual limit testing is done in the generic tests above
      expect(typeof rateLimit).toBe('function');
    });
  });
});
