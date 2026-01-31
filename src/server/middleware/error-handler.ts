/**
 * Error Handler Middleware
 */

import type { Context } from 'hono';
import { AppError } from '@/core/errors';

export function errorHandler(err: Error, c: Context) {
  const isDev = process.env.NODE_ENV === 'development';

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
      },
    },
    500
  );
}
