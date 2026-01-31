/**
 * 认证中间件
 *
 * 验证 JWT token 并注入用户信息到 Hono context
 */

import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import { verifyAccessToken, extractTokenFromHeader } from '../../core/jwt';
import { userRepository } from '../../db/repositories/user.repository';
import { UnauthorizedError } from '../../core/errors';
import type { AuthUser } from '../../types/auth';

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
    tenantId: string;
  }
}

export function authMiddleware() {
  return createMiddleware(async (c: Context, next) => {
    const authHeader = c.req.header('Authorization');
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      throw new UnauthorizedError('Missing authentication token');
    }

    try {
      const payload = await verifyAccessToken(token);
      const user = await userRepository.findById(payload.userId);

      if (!user || !user.isActive) {
        throw new UnauthorizedError('User not found or inactive');
      }

      c.set('user', {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      });
      c.set('tenantId', user.tenantId);

      return next();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      throw new UnauthorizedError('Invalid authentication token');
    }
  });
}

export function optionalAuthMiddleware() {
  return createMiddleware(async (c: Context, next) => {
    const authHeader = c.req.header('Authorization');
    const token = extractTokenFromHeader(authHeader);

    if (token) {
      try {
        const payload = await verifyAccessToken(token);
        const user = await userRepository.findById(payload.userId);

        if (user && user.isActive) {
          c.set('user', {
            id: user.id,
            tenantId: user.tenantId,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          });
          c.set('tenantId', user.tenantId);
        }
      } catch {
        // Ignore invalid tokens for optional auth
      }
    }

    return next();
  });
}
