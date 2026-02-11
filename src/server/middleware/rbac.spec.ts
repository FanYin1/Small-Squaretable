/**
 * RBAC Middleware Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { requireRole } from './rbac';

describe('RBAC Middleware', () => {
  let app: Hono;

  function createApp(minRole: 'user' | 'moderator' | 'admin') {
    const app = new Hono();
    // Simulate auth middleware by setting user from a custom header
    app.use('/*', async (c, next) => {
      const role = c.req.header('X-Test-Role');
      if (role) {
        c.set('user', {
          id: '123',
          tenantId: '456',
          email: 'test@example.com',
          displayName: null,
          avatarUrl: null,
          role,
        });
      }
      return next();
    });
    app.use('/*', requireRole(minRole));
    app.get('/test', (c) => c.json({ ok: true }));
    // Error handler to convert ForbiddenError to 403
    app.onError((err, c) => {
      if (err.message.includes('required') || err.message.includes('Requires')) {
        return c.json({ error: err.message }, 403);
      }
      return c.json({ error: 'Internal error' }, 500);
    });
    return app;
  }

  describe('requireRole("admin")', () => {
    beforeEach(() => {
      app = createApp('admin');
    });

    it('should allow admin users', async () => {
      const res = await app.request('/test', {
        headers: { 'X-Test-Role': 'admin' },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it('should block moderator users', async () => {
      const res = await app.request('/test', {
        headers: { 'X-Test-Role': 'moderator' },
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Requires admin role or higher');
    });

    it('should block regular users', async () => {
      const res = await app.request('/test', {
        headers: { 'X-Test-Role': 'user' },
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Requires admin role or higher');
    });
  });

  describe('requireRole("moderator")', () => {
    beforeEach(() => {
      app = createApp('moderator');
    });

    it('should allow admin users', async () => {
      const res = await app.request('/test', {
        headers: { 'X-Test-Role': 'admin' },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it('should allow moderator users', async () => {
      const res = await app.request('/test', {
        headers: { 'X-Test-Role': 'moderator' },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it('should block regular users', async () => {
      const res = await app.request('/test', {
        headers: { 'X-Test-Role': 'user' },
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Requires moderator role or higher');
    });
  });

  describe('requireRole("user")', () => {
    beforeEach(() => {
      app = createApp('user');
    });

    it('should allow admin users', async () => {
      const res = await app.request('/test', {
        headers: { 'X-Test-Role': 'admin' },
      });
      expect(res.status).toBe(200);
    });

    it('should allow moderator users', async () => {
      const res = await app.request('/test', {
        headers: { 'X-Test-Role': 'moderator' },
      });
      expect(res.status).toBe(200);
    });

    it('should allow regular users', async () => {
      const res = await app.request('/test', {
        headers: { 'X-Test-Role': 'user' },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('no authenticated user', () => {
    it('should return 403 when no user is set', async () => {
      app = createApp('admin');
      const res = await app.request('/test');
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Authentication required');
    });
  });
});
