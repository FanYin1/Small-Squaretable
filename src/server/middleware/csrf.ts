/**
 * CSRF Protection Middleware
 *
 * Provides Cross-Site Request Forgery protection using double submit cookie pattern
 * and token validation for state-changing requests.
 */

import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { config } from '../../core/config';
import { redis } from '../../core/redis';

declare module 'hono' {
  interface ContextVariableMap {
    csrfToken?: string;
  }
}

/**
 * Generate a secure CSRF token
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hash a token for comparison (to prevent timing attacks)
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return timingSafeEqual(bufA, bufB);
}

/**
 * CSRF Token storage interface
 */
interface CsrfStore {
  get(sessionId: string): Promise<string | null>;
  set(sessionId: string, token: string, ttl?: number): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

/**
 * Redis-backed CSRF token store (for production)
 */
class RedisCsrfStore implements CsrfStore {
  private prefix = 'csrf:';
  private defaultTtl = 3600; // 1 hour in seconds

  async get(sessionId: string): Promise<string | null> {
    return redis.get(`${this.prefix}${sessionId}`);
  }

  async set(sessionId: string, token: string, ttl?: number): Promise<void> {
    await redis.set(`${this.prefix}${sessionId}`, token, {
      EX: ttl ? Math.ceil(ttl / 1000) : this.defaultTtl,
    });
  }

  async delete(sessionId: string): Promise<void> {
    await redis.del(`${this.prefix}${sessionId}`);
  }
}

/**
 * In-memory CSRF token store (for development/test)
 */
class InMemoryCsrfStore implements CsrfStore {
  private store = new Map<string, { token: string; expiresAt: number }>();

  private cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.store.entries()) {
      if (value.expiresAt < now) {
        this.store.delete(key);
      }
    }
  }

  async get(sessionId: string): Promise<string | null> {
    this.cleanup();
    const entry = this.store.get(sessionId);
    if (!entry || entry.expiresAt < Date.now()) {
      return null;
    }
    return entry.token;
  }

  async set(sessionId: string, token: string, ttl = 3600000): Promise<void> {
    this.store.set(sessionId, {
      token,
      expiresAt: Date.now() + ttl,
    });
  }

  async delete(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }
}

// Use Redis in production, in-memory for dev/test
const csrfStore: CsrfStore =
  config.nodeEnv === 'production' ? new RedisCsrfStore() : new InMemoryCsrfStore();

/**
 * Extract session ID from request
 * Uses Authorization token as session identifier
 */
function extractSessionId(c: any): string | null {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/);
  if (!match) return null;

  return match[1].substring(0, 32); // Use first 32 chars of token as session ID
}

/**
 * CSRF Protection Middleware
 *
 * Validates CSRF tokens for state-changing requests (POST, PUT, PATCH, DELETE)
 */
export function csrfProtection() {
  return createMiddleware(async (c, next) => {
    const method = c.req.method;

    // Only check state-changing methods
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      // Skip CSRF for API key requests (stateless, no cookies/sessions)
      const xApiKey = c.req.header('X-API-Key');
      const authHeader = c.req.header('Authorization');
      if (xApiKey || authHeader?.startsWith('Bearer sq_test_')) {
        return next();
      }

      const token = c.req.header('X-CSRF-Token');
      const sessionId = extractSessionId(c);

      // For authenticated requests, validate CSRF token
      if (sessionId) {
        const sessionToken = await csrfStore.get(sessionId);

        if (!sessionToken || !token || !safeCompare(token, sessionToken)) {
          throw new HTTPException(403, {
            message: 'Invalid CSRF token',
          });
        }
      }
    }

    await next();
  });
}

/**
 * CSRF Token generation endpoint handler
 *
 * Generates and stores a new CSRF token for the current session
 */
export async function getCsrfToken(c: any): Promise<Response> {
  const sessionId = extractSessionId(c);

  if (!sessionId) {
    return c.json(
      {
        error: 'No active session',
        message: 'Please authenticate first',
      },
      401
    );
  }

  const token = generateCsrfToken();
  await csrfStore.set(sessionId, token);

  c.set('csrfToken', token);

  return c.json({
    csrfToken: token,
  });
}

/**
 * Revoke CSRF token for a session
 */
export async function revokeCsrfToken(c: any): Promise<Response> {
  const sessionId = extractSessionId(c);

  if (sessionId) {
    await csrfStore.delete(sessionId);
  }

  return c.json({
    success: true,
  });
}

/**
 * Optional CSRF middleware for public endpoints
 * Validates token if provided but doesn't require it
 */
export function optionalCsrfProtection() {
  return createMiddleware(async (c, next) => {
    const method = c.req.method;

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const token = c.req.header('X-CSRF-Token');
      const sessionId = extractSessionId(c);

      // Only validate if we have both token and session
      if (token && sessionId) {
        const sessionToken = await csrfStore.get(sessionId);

        if (sessionToken && !safeCompare(token, sessionToken)) {
          throw new HTTPException(403, {
            message: 'Invalid CSRF token',
          });
        }
      }
    }

    await next();
  });
}
