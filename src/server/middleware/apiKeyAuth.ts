/**
 * API Key Authentication Middleware
 *
 * Authenticates requests via API key (X-API-Key header or Bearer sq_test_... token)
 * and provides scope-checking middleware for fine-grained access control.
 */

import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import { ForbiddenError } from '@/core/errors';

declare module 'hono' {
  interface ContextVariableMap {
    apiKeyScopes?: string[];
    authMethod?: 'jwt' | 'apiKey';
  }
}

/**
 * Middleware that authenticates requests using API keys.
 *
 * Checks for API key in:
 * 1. X-API-Key header
 * 2. Authorization: Bearer sq_test_... header
 *
 * If no API key is found, falls through to allow other auth methods (e.g. JWT).
 * On successful validation, sets user, tenantId, apiKeyScopes, and authMethod in context.
 */
export function apiKeyAuthMiddleware() {
  return createMiddleware(async (c: Context, next) => {
    const apiKey = extractApiKey(c);
    if (!apiKey) {
      return next();
    }

    const { apiKeyService } = await import('../services/apiKey.service');
    const { userId, tenantId, scopes } = await apiKeyService.validateApiKey(apiKey);

    const { userRepository } = await import('@db/repositories/user.repository');
    const user = await userRepository.findById(userId);

    if (!user || !user.isActive) {
      const { UnauthorizedError } = await import('@/core/errors');
      throw new UnauthorizedError('User not found or inactive');
    }

    c.set('user', {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
    });
    c.set('tenantId', tenantId);
    c.set('apiKeyScopes', scopes);
    c.set('authMethod', 'apiKey');

    return next();
  });
}

/**
 * Middleware that checks whether the current API key has the required scopes.
 *
 * For JWT-authenticated requests (authMethod !== 'apiKey'), all scopes are
 * implicitly granted and the middleware passes through.
 *
 * @param requiredScopes - The scopes that must be present on the API key
 */
export function requireScopes(...requiredScopes: string[]) {
  return createMiddleware(async (c: Context, next) => {
    const authMethod = c.get('authMethod');
    if (authMethod !== 'apiKey') {
      return next();
    }

    const keyScopes = c.get('apiKeyScopes') || [];
    const missing = requiredScopes.filter((s) => !keyScopes.includes(s));

    if (missing.length > 0) {
      throw new ForbiddenError(`Missing required scopes: ${missing.join(', ')}`);
    }

    return next();
  });
}

/**
 * Extracts an API key from the request headers.
 *
 * Checks X-API-Key header first, then Authorization: Bearer sq_test_... header.
 * Returns null if no API key is found.
 */
function extractApiKey(c: Context): string | null {
  const xApiKey = c.req.header('X-API-Key');
  if (xApiKey) return xApiKey;

  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer sq_test_')) {
    return authHeader.slice(7);
  }

  return null;
}
