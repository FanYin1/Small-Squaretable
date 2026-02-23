/**
 * Request Timing Middleware
 *
 * Measures request duration and sets X-Response-Time header.
 * Logs slow requests at warn level.
 */

import { Context, Next } from 'hono';
import { logRequestWithId } from './request-id';

const SLOW_REQUEST_THRESHOLD_MS = 1000;

export async function requestTimingMiddleware(c: Context, next: Next) {
  const start = Date.now();

  await next();

  const duration = Date.now() - start;
  c.header('X-Response-Time', `${duration}ms`);

  // Log request with timing
  logRequestWithId(c, c.req.method, c.req.path, c.res.status, duration);

  // Warn on slow requests
  if (duration > SLOW_REQUEST_THRESHOLD_MS) {
    const logger = c.get('logger');
    if (logger) {
      logger.warn('Slow request detected', {
        http: { method: c.req.method, path: c.req.path, status: c.res.status, duration },
      });
    }
  }
}
