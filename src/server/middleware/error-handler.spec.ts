/**
 * Error Handler Middleware 测试
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { errorHandler } from './error-handler';
import { AppError } from '@/core/errors';

describe('Error Handler Middleware', () => {
  it('should handle AppError with correct status code', async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.get('/test', () => {
      throw new AppError('Test error', 400, 'TEST_ERROR');
    });

    const res = await app.request('/test');
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('TEST_ERROR');
    expect(data.error.message).toBe('Test error');
  });

  it('should handle generic errors as 500', async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.get('/test', () => {
      throw new Error('Unexpected error');
    });

    const res = await app.request('/test');
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.code).toBe('INTERNAL_ERROR');
  });

  it('should hide error details in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const app = new Hono();
    app.onError(errorHandler);
    app.get('/test', () => {
      throw new Error('Secret error');
    });

    const res = await app.request('/test');
    const data = await res.json();
    expect(data.error.message).not.toContain('Secret');

    process.env.NODE_ENV = originalEnv;
  });

  it('should include timestamp in response', async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.get('/test', () => {
      throw new AppError('Test error', 400, 'TEST_ERROR');
    });

    const res = await app.request('/test');
    const data = await res.json();
    expect(data.meta.timestamp).toBeDefined();
    expect(new Date(data.meta.timestamp).getTime()).toBeGreaterThan(0);
  });

  it('should include error details in development mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const app = new Hono();
    app.onError(errorHandler);
    app.get('/test', () => {
      throw new AppError('Test error', 400, 'TEST_ERROR', { field: 'email' });
    });

    const res = await app.request('/test');
    const data = await res.json();
    expect(data.error.details).toEqual({ field: 'email' });

    process.env.NODE_ENV = originalEnv;
  });

  it('should hide error details in production mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const app = new Hono();
    app.onError(errorHandler);
    app.get('/test', () => {
      throw new AppError('Test error', 400, 'TEST_ERROR', { field: 'email' });
    });

    const res = await app.request('/test');
    const data = await res.json();
    expect(data.error.details).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });

  it('should set success to false in error response', async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.get('/test', () => {
      throw new AppError('Test error', 400, 'TEST_ERROR');
    });

    const res = await app.request('/test');
    const data = await res.json();
    expect(data.success).toBe(false);
  });
});
