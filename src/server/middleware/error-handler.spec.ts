/**
 * Error Handler Middleware 测试
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { errorHandler } from './error-handler';
import { AppError } from '@/core/errors';

/**
 * HTTPException 是 Hono 自己的错误类型，中间件层用的就是它（见 middleware/csrf.ts）。
 * 它此前不被识别，一律落到 500 分支：CSRF 校验失败在线上表现为
 * `500 INTERNAL_ERROR`，而前端 api.ts 是靠 `error.status === 403` 才会去
 * 刷新 CSRF token 并重试的——状态码错了，那条自动恢复路径永远不触发，
 * 用户看到的是硬报错；监控侧则把每次 CSRF 拒绝都记成 5xx。
 */
describe('HTTPException（Hono 中间件抛的错误）', () => {
  function appThrowing(err: Error) {
    const app = new Hono();
    app.onError(errorHandler);
    app.get('/test', () => {
      throw err;
    });
    return app;
  }

  it('保留 HTTPException 自己的状态码，而不是变成 500', async () => {
    const res = await appThrowing(
      new HTTPException(403, { message: 'Invalid CSRF token' }),
    ).request('/test');
    expect(res.status).toBe(403);
  });

  it('CSRF 失败要能被前端识别：403 + 可读的 message', async () => {
    const res = await appThrowing(
      new HTTPException(403, { message: 'Invalid CSRF token' }),
    ).request('/test');
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.message).toBe('Invalid CSRF token');
    expect(data.error.code).not.toBe('INTERNAL_ERROR');
  });

  it('生产环境也要保留 message——这类错误是给客户端看的，不是内部细节', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await appThrowing(
        new HTTPException(403, { message: 'Invalid CSRF token' }),
      ).request('/test');
      expect(res.status).toBe(403);
      expect((await res.json()).error.message).toBe('Invalid CSRF token');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('其它状态码同样透传', async () => {
    const res = await appThrowing(new HTTPException(429, { message: 'Too many' })).request('/test');
    expect(res.status).toBe(429);
  });

  it('响应结构和 AppError 一致，客户端不用分两种解析', async () => {
    const res = await appThrowing(new HTTPException(403, { message: 'nope' })).request('/test');
    const data = await res.json();
    expect(Object.keys(data).sort()).toEqual(['error', 'meta', 'success']);
    expect(data.meta.timestamp).toBeDefined();
  });
});

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
