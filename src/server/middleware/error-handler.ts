/**
 * Error Handler Middleware
 */

import type { Context } from 'hono';
import { AppError } from '@/core/errors';
import { captureException, addBreadcrumb } from '@/server/services/sentry.service';
import { getLogger, getRequestId } from './request-id';

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
      statusCode: err instanceof AppError ? err.statusCode : 500,
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
      code: err instanceof AppError ? err.code : 'INTERNAL_ERROR',
      statusCode: err instanceof AppError ? err.statusCode : 500,
    });
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
