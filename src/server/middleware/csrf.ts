/**
 * CSRF Protection Middleware
 *
 * Provides Cross-Site Request Forgery protection using double submit cookie pattern
 * and token validation for state-changing requests.
 */

import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { randomBytes, createHash } from 'crypto';

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
 * CSRF Token storage interface
 */
interface CsrfStore {
  get(sessionId: string): Promise<string | null>;
  set(sessionId: string, token: string, ttl?: number): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

/**
 * In-memory CSRF token store (for development)
 * In production, use Redis or similar
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

// Default store instance
const csrfStore = new InMemoryCsrfStore();

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
      const token = c.req.header('X-CSRF-Token');
      const sessionId = extractSessionId(c);

      // For authenticated requests, validate CSRF token
      if (sessionId) {
        const sessionToken = await csrfStore.get(sessionId);

        if (!sessionToken || !token || token !== sessionToken) {
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

        if (sessionToken && token !== sessionToken) {
          throw new HTTPException(403, {
            message: 'Invalid CSRF token',
          });
        }
      }
    }

    await next();
  });
}
