/**
 * Rate Limiting Middleware
 *
 * Provides configurable rate limiting using in-memory storage (for development)
 * or Redis (for production). Protects against brute force attacks and API abuse.
 */

import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

declare module 'hono' {
  interface ContextVariableMap {
    rateLimit?: {
      limit: number;
      remaining: number;
      reset: number;
    };
  }
}

/**
 * Rate limit configuration
 */
interface RateLimitOptions {
  /**
   * Maximum number of requests allowed
   */
  limit: number;

  /**
   * Time window in milliseconds
   */
  windowMs: number;

  /**
   * Key generator function
   * Default: uses IP address
   */
  keyGenerator?: (c: any) => string;

  /**
   * Handler for rate limit exceeded
   */
  handler?: (c: any) => Response | Promise<Response>;

  /**
   * Skip rate limit for certain requests
   */
  skip?: (c: any) => boolean;

  /**
   * Custom message for rate limit exceeded
   */
  message?: string;
}

/**
 * Rate limit entry
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Rate limit store interface
 */
interface RateLimitStore {
  get(key: string): Promise<RateLimitEntry | null>;
  set(key: string, entry: RateLimitEntry): Promise<void>;
  increment(key: string, ttl: number): Promise<RateLimitEntry>;
  delete(key: string): Promise<void>;
  cleanup(): void;
}

/**
 * In-memory rate limit store
 * For development and small-scale deployments
 */
class InMemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, RateLimitEntry>();

  async get(key: string): Promise<RateLimitEntry | null> {
    const entry = this.store.get(key);
    if (!entry || entry.resetAt < Date.now()) {
      return null;
    }
    return entry;
  }

  async set(key: string, entry: RateLimitEntry): Promise<void> {
    this.store.set(key, entry);
  }

  async increment(key: string, ttl: number): Promise<RateLimitEntry> {
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || existing.resetAt < now) {
      const entry: RateLimitEntry = {
        count: 1,
        resetAt: now + ttl,
      };
      this.store.set(key, entry);
      return entry;
    }

    existing.count += 1;
    return existing;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.store.entries()) {
      if (value.resetAt < now) {
        this.store.delete(key);
      }
    }
  }
}

// Default store instance
const rateLimitStore = new InMemoryRateLimitStore();

// Periodic cleanup (every 5 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    rateLimitStore.cleanup();
  }, 5 * 60 * 1000);
}

/**
 * Default key generator - uses IP address or user ID
 */
function defaultKeyGenerator(c: any): string {
  // Try to use user ID from context
  const user = c.get('user');
  if (user?.id) {
    return `user:${user.id}`;
  }

  // Fall back to IP address
  const ip = c.req.header('x-forwarded-for')?.split(',')[0] ||
             c.req.header('x-real-ip') ||
             c.req.header('cf-connecting-ip') ||
             'unknown';
  return `ip:${ip}`;
}

/**
 * Default rate limit exceeded handler
 */
function defaultRateLimitHandler(c: any, options: RateLimitOptions): Response {
  const retryAfter = Math.ceil((c.get('rateLimit')?.reset || 0 - Date.now()) / 1000);

  return c.json(
    {
      error: 'Rate limit exceeded',
      message: options.message || 'Too many requests, please try again later',
      retryAfter: retryAfter > 0 ? retryAfter : 60,
    },
    429
  );
}

/**
 * Rate limiting middleware
 */
export function rateLimit(options: RateLimitOptions) {
  const {
    limit,
    windowMs,
    keyGenerator = defaultKeyGenerator,
    handler,
    skip,
    message = 'Too many requests',
  } = options;

  return createMiddleware(async (c, next) => {
    // Skip if configured
    if (skip && skip(c)) {
      await next();
      return;
    }

    const key = keyGenerator(c);
    const entry = await rateLimitStore.increment(key, windowMs);
    const remaining = Math.max(0, limit - entry.count);

    // Store rate limit info in context
    c.set('rateLimit', {
      limit,
      remaining,
      reset: entry.resetAt,
    });

    // Set rate limit headers
    c.header('X-RateLimit-Limit', limit.toString());
    c.header('X-RateLimit-Remaining', remaining.toString());
    c.header('X-RateLimit-Reset', entry.resetAt.toString());

    // Check if limit exceeded
    if (entry.count > limit) {
      const retryAfter = Math.ceil((entry.resetAt - Date.now()) / 1000);
      c.header('Retry-After', retryAfter.toString());

      if (handler) {
        throw await handler(c);
      }

      return defaultRateLimitHandler(c, { limit, windowMs, message });
    }

    await next();
  });
}

/**
 * Pre-configured rate limiters for common use cases
 */

// Check if we're in test/development environment
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';

// Strict rate limiter for authentication endpoints
export const authRateLimit = rateLimit({
  limit: isTestEnv ? 100 : 5, // More lenient in test/dev
  windowMs: 60 * 1000, // per minute
  message: 'Too many authentication attempts, please try again later',
});

// Registration rate limiter (more strict)
export const registrationRateLimit = rateLimit({
  limit: isTestEnv ? 50 : 3, // More lenient in test/dev
  windowMs: 60 * 60 * 1000, // per hour
  message: 'Too many registration attempts, please try again later',
});

// Password reset rate limiter
export const passwordResetRateLimit = rateLimit({
  limit: 3,
  windowMs: 60 * 60 * 1000, // 3 requests per hour
  message: 'Too many password reset attempts, please try again later',
});

// General API rate limiter
export const apiRateLimit = rateLimit({
  limit: 100,
  windowMs: 60 * 1000, // 100 requests per minute
  message: 'API rate limit exceeded',
});

// LLM chat rate limiter (more generous)
export const chatRateLimit = rateLimit({
  limit: 30,
  windowMs: 60 * 1000, // 30 messages per minute
  message: 'Too many messages, please slow down',
});

// Character search rate limiter
export const searchRateLimit = rateLimit({
  limit: isTestEnv ? 200 : 20, // More lenient in test/dev
  windowMs: 60 * 1000, // 20 searches per minute in production
  message: 'Too many search requests, please slow down',
});

// Webhook rate limiter
export const webhookRateLimit = rateLimit({
  limit: 100,
  windowMs: 60 * 1000, // 100 webhooks per minute
  message: 'Too many webhook deliveries',
});
