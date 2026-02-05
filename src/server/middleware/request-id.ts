/**
 * Request ID Middleware
 *
 * Generates and propagates a unique request ID for distributed tracing
 */

import { Context, Next } from 'hono';
import { createLogger } from '../services/logger.service';
import { nanoid } from 'nanoid';

const X_REQUEST_ID_HEADER = 'X-Request-ID';
const REQUEST_ID_LENGTH = 21; // nanoid default length

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return nanoid(REQUEST_ID_LENGTH);
}

/**
 * Request ID middleware
 * - Generates or extracts request ID from header
 * - Makes it available in context
 * - Returns it in response header
 */
export async function requestIdMiddleware(c: Context, next: Next) {
  // Try to get existing request ID from header
  let requestId = c.req.header(X_REQUEST_ID_HEADER);

  // If no existing ID, generate one
  if (!requestId) {
    requestId = generateRequestId();
  }

  // Store in context for downstream use
  c.set('requestId', requestId);

  // Add to response header
  c.header(X_REQUEST_ID_HEADER, requestId);

  // Create a logger with request ID context
  const logger = createLogger({ requestId });
  c.set('logger', logger);

  await next();
}

/**
 * Get request ID from context
 */
export function getRequestId(c: Context): string | undefined {
  return c.get('requestId');
}

/**
 * Get logger from context
 */
export function getLogger(c: Context) {
  return c.get('logger');
}

/**
 * Log request with request ID
 */
export function logRequestWithId(c: Context, method: string, path: string, status: number, duration: number) {
  const logger = getLogger(c);
  const userId = c.get('userId');
  const tenantId = c.get('tenantId');

  if (logger) {
    const logLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    const message = `${method} ${path} ${status}`;

    logger[logLevel](message, {
      http: {
        method,
        path,
        status,
        duration,
      },
      userId,
      tenantId,
      requestId: getRequestId(c),
    });
  }
}
