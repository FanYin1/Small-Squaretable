/**
 * Tenant Middleware 测试
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { tenantMiddleware } from './tenant';

describe('Tenant Middleware', () => {
  it('should extract tenant ID from header', async () => {
    const app = new Hono();
    app.use('*', tenantMiddleware());
    app.get('/test', (c) => {
      return c.json({ tenantId: c.get('tenantId') });
    });

    const res = await app.request('/test', {
      headers: { 'X-Tenant-ID': 'test-tenant-123' },
    });

    const data = await res.json();
    expect(data.tenantId).toBe('test-tenant-123');
  });

  it('should return 400 if tenant ID is missing', async () => {
    const app = new Hono();
    app.use('*', tenantMiddleware());
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(400);
  });

  it('should skip tenant check for public routes', async () => {
    const app = new Hono();
    app.use('*', tenantMiddleware({ publicPaths: ['/health'] }));
    app.get('/health', (c) => c.json({ status: 'ok' }));

    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });

  it('should skip tenant check for auth routes by default', async () => {
    const app = new Hono();
    app.use('*', tenantMiddleware());
    app.get('/api/v1/auth/login', (c) => c.json({ ok: true }));

    const res = await app.request('/api/v1/auth/login');
    expect(res.status).toBe(200);
  });

  it('should use custom header name when provided', async () => {
    const app = new Hono();
    app.use('*', tenantMiddleware({ headerName: 'X-Custom-Tenant' }));
    app.get('/test', (c) => {
      return c.json({ tenantId: c.get('tenantId') });
    });

    const res = await app.request('/test', {
      headers: { 'X-Custom-Tenant': 'custom-tenant-456' },
    });

    const data = await res.json();
    expect(data.tenantId).toBe('custom-tenant-456');
  });

  it('should return error message when tenant ID is missing', async () => {
    const app = new Hono();
    app.use('*', tenantMiddleware());
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('Missing tenant ID');
    expect(data.message).toContain('X-Tenant-ID');
  });
});
