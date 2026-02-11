/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * Enforces role hierarchy: user < moderator < admin
 */

import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import { ForbiddenError } from '../../core/errors';

export type Role = 'user' | 'moderator' | 'admin';

const ROLE_HIERARCHY: Record<Role, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
};

/**
 * Middleware that requires the authenticated user to have at least the specified role.
 * Must be used after authMiddleware so that c.get('user') is available.
 */
export function requireRole(minRole: Role) {
  return createMiddleware(async (c: Context, next) => {
    const user = c.get('user');
    if (!user) {
      throw new ForbiddenError('Authentication required');
    }

    const userLevel = ROLE_HIERARCHY[user.role as Role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole];

    if (userLevel < requiredLevel) {
      throw new ForbiddenError(`Requires ${minRole} role or higher`);
    }

    return next();
  });
}
