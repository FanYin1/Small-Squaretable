/**
 * Request Timing Middleware Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock the request-id module before importing the middleware
vi.mock('./request-id', () => ({
  logRequestWithId: vi.fn(),
}));

import { requestTimingMiddleware } from './request-timing';
import { logRequestWithId } from './request-id';

describe('Request Timing Middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use('*', requestTimingMiddleware);
  });

  it('should set X-Response-Time header on response', async () => {
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Response-Time')).toBeDefined();
  });

  it('should format header as "Nms" where N is a non-negative integer', async () => {
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    const header = res.headers.get('X-Response-Time');
    expect(header).toMatch(/^\d+ms$/);

    const ms = parseInt(header!.replace('ms', ''), 10);
    expect(ms).toBeGreaterThanOrEqual(0);
  });

  it('should call logRequestWithId with correct arguments', async () => {
    app.get('/hello', (c) => c.json({ ok: true }));

    await app.request('/hello');

    expect(logRequestWithId).toHaveBeenCalledTimes(1);
    expect(logRequestWithId).toHaveBeenCalledWith(
      expect.anything(),   // context
      'GET',               // method
      '/hello',            // path
      200,                 // status
      expect.any(Number),  // duration
    );
  });

  it('should log warning for requests exceeding threshold', async () => {
    const warnFn = vi.fn();
    app = new Hono();
    // Set up a logger in context before the timing middleware
    app.use('*', async (c, next) => {
      c.set('logger', { warn: warnFn, info: vi.fn(), error: vi.fn(), debug: vi.fn() });
      await next();
    });
    app.use('*', requestTimingMiddleware);
    app.get('/slow', async (c) => {
      // Simulate a slow request by advancing Date.now
      await new Promise((resolve) => setTimeout(resolve, 5));
      return c.json({ ok: true });
    });

    // Mock Date.now to simulate a slow request (>1000ms)
    const originalDateNow = Date.now;
    let callCount = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      // First call: start time, subsequent calls: start + 1500ms
      if (callCount === 1) return 1000;
      return 2500;
    });

    await app.request('/slow');

    expect(warnFn).toHaveBeenCalledWith('Slow request detected', {
      http: {
        method: 'GET',
        path: '/slow',
        status: 200,
        duration: 1500,
      },
    });

    Date.now = originalDateNow;
    vi.restoreAllMocks();
    // Re-mock the module-level mock
    vi.mocked(logRequestWithId).mockClear();
  });

  it('should not log warning for fast requests', async () => {
    const warnFn = vi.fn();
    app = new Hono();
    app.use('*', async (c, next) => {
      c.set('logger', { warn: warnFn, info: vi.fn(), error: vi.fn(), debug: vi.fn() });
      await next();
    });
    app.use('*', requestTimingMiddleware);
    app.get('/fast', (c) => c.json({ ok: true }));

    await app.request('/fast');

    expect(warnFn).not.toHaveBeenCalled();
  });

  it('should work when logger is not set in context', async () => {
    // No logger middleware — logger is undefined in context
    app.get('/no-logger', (c) => c.json({ ok: true }));

    const res = await app.request('/no-logger');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Response-Time')).toMatch(/^\d+ms$/);
  });
});
