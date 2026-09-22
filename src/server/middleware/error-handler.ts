/**
 * Error Handler Middleware
 */

import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { AppError } from '@/core/errors';
import { captureException, addBreadcrumb } from '@/server/services/sentry.service';
import { getLogger, getRequestId } from './request-id';

/** HTTPException 只带状态码，这里给出和 AppError 同风格的机器可读 code */
const HTTP_ERROR_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMIT_EXCEEDED',
};

function statusOf(err: Error): number {
  if (err instanceof AppError) return err.statusCode;
  if (err instanceof HTTPException) return err.status;
  return 500;
}

function codeOf(err: Error): string {
  if (err instanceof AppError) return err.code;
  if (err instanceof HTTPException) return HTTP_ERROR_CODES[err.status] ?? 'HTTP_ERROR';
  return 'INTERNAL_ERROR';
}

export function errorHandler(err: Error, c: Context) {
  const isDev = process.env.NODE_ENV === 'development';
  const requestId = getRequestId(c);
  const logger = getLogger(c);

  // Add breadcrumb for context
  addBreadcrumb(
    'Error occurred',
    'error',
    'error',
    {
      requestId,
      path: c.req.path,
      method: c.req.method,
      statusCode: statusOf(err),
    }
  );

  // Capture to Sentry if enabled
  captureException(err, {
    requestId,
    path: c.req.path,
    method: c.req.method,
    userId: c.get('userId'),
    tenantId: c.get('tenantId'),
  });

  // Log the error
  if (logger) {
    logger.error(err.message, err, {
      requestId,
      path: c.req.path,
      method: c.req.method,
      code: codeOf(err),
      statusCode: statusOf(err),
    });
  }

  // Hono 中间件抛的是 HTTPException（见 middleware/csrf.ts）。它此前不被识别，
  // 一律落到下面的 500 分支——CSRF 校验失败在线上表现为 500 INTERNAL_ERROR。
  // 而前端 api.ts 是靠 `error.status === 403` 才会刷新 CSRF token 并重试的，
  // 状态码错了那条自动恢复路径就永远不触发。message 在生产环境也要保留：
  // 这类错误本来就是给客户端看的，不是内部细节。
  if (err instanceof HTTPException) {
    return c.json(
      {
        success: false,
        error: {
          code: codeOf(err),
          message: err.message,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
        },
      },
      err.status
    );
  }

  if (err instanceof AppError) {
    return c.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          ...(isDev && err.details ? { details: err.details } : {}),
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
        },
      },
      err.statusCode as 400 | 401 | 403 | 404 | 500
    );
  }

  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: isDev ? err.message : 'Internal server error',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
      },
    },
    500
  );
}
