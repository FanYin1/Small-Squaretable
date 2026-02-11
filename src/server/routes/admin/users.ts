/**
 * Admin User Management Routes
 *
 * All routes require authMiddleware() + requireRole('admin').
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { userRepository } from '../../../db/repositories/user.repository';
import { subscriptionRepository } from '../../../db/repositories/subscription.repository';
import { oauthRepository } from '../../../db/repositories/oauth.repository';
import { authService } from '../../services/auth.service';
import { NotFoundError, BadRequestError } from '../../../core/errors';
import { paginationSchema } from '../../../types/api';
import type { ApiResponse } from '../../../types/api';
import { users } from '../../../db/schema/users';
import { sql, ilike, or, desc, asc } from 'drizzle-orm';
import { db } from '../../../db/index';

export const adminUserRoutes = new Hono();

// All routes require admin role
adminUserRoutes.use('*', authMiddleware(), requireRole('admin'));

const userSearchSchema = paginationSchema.extend({
  search: z.string().optional(),
});

const changeRoleSchema = z.object({
  role: z.enum(['user', 'moderator', 'admin']),
});

// GET / — List users (paginated, searchable by email/displayName)
adminUserRoutes.get(
  '/',
  zValidator('query', userSearchSchema),
  async (c) => {
    const { page, limit, search, sortBy, sortOrder } = c.req.valid('query');
    const offset = (page - 1) * limit;

    const conditions = [];
    if (search) {
      conditions.push(
        or(
          ilike(users.email, `%${search}%`),
          ilike(users.displayName, `%${search}%`),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? conditions[0] : undefined;
    const orderColumn = sortBy === 'email' ? users.email
      : sortBy === 'displayName' ? users.displayName
      : users.createdAt;
    const orderDir = sortOrder === 'asc' ? asc(orderColumn) : desc(orderColumn);

    const [items, [{ count }]] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          role: users.role,
          isActive: users.isActive,
          emailVerified: users.emailVerified,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .where(whereClause)
        .orderBy(orderDir)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(whereClause),
    ]);

    const total = count;
    const totalPages = Math.ceil(total / limit);

    return c.json<ApiResponse>({
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      meta: { timestamp: new Date().toISOString() },
    });
  },
);

// GET /:id — Get user details (profile + subscription + oauth accounts)
adminUserRoutes.get('/:id', async (c) => {
  const userId = c.req.param('id');
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  const [subscription, oauthAccounts] = await Promise.all([
    subscriptionRepository.findByTenantId(user.tenantId),
    oauthRepository.findByUserId(userId),
  ]);

  // Strip sensitive fields
  const { passwordHash, totpSecret, emailVerificationToken, ...safeUser } = user as any;

  return c.json<ApiResponse>({
    success: true,
    data: {
      user: safeUser,
      subscription,
      oauthAccounts: oauthAccounts.map((a: any) => ({
        provider: a.provider,
        providerAccountId: a.providerAccountId,
        createdAt: a.createdAt,
      })),
    },
    meta: { timestamp: new Date().toISOString() },
  });
});

// PATCH /:id/role — Change user role
adminUserRoutes.patch(
  '/:id/role',
  zValidator('json', changeRoleSchema),
  async (c) => {
    const userId = c.req.param('id');
    const { role } = c.req.valid('json');

    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    // Prevent admin from changing their own role
    const currentUser = c.get('user');
    if (currentUser.id === userId) {
      throw new BadRequestError('Cannot change your own role');
    }

    const updated = await userRepository.update(userId, { role } as any);

    return c.json<ApiResponse>({
      success: true,
      data: { id: updated!.id, role: updated!.role },
      meta: { timestamp: new Date().toISOString() },
    });
  },
);

// POST /:id/suspend — Suspend user (set isActive = false)
adminUserRoutes.post('/:id/suspend', async (c) => {
  const userId = c.req.param('id');
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  const currentUser = c.get('user');
  if (currentUser.id === userId) {
    throw new BadRequestError('Cannot suspend yourself');
  }

  if (!user.isActive) {
    throw new BadRequestError('User is already suspended');
  }

  await userRepository.update(userId, { isActive: false } as any);

  return c.json<ApiResponse>({
    success: true,
    data: { id: userId, isActive: false },
    meta: { timestamp: new Date().toISOString() },
  });
});

// POST /:id/unsuspend — Unsuspend user
adminUserRoutes.post('/:id/unsuspend', async (c) => {
  const userId = c.req.param('id');
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  if (user.isActive) {
    throw new BadRequestError('User is not suspended');
  }

  await userRepository.update(userId, { isActive: true } as any);

  return c.json<ApiResponse>({
    success: true,
    data: { id: userId, isActive: true },
    meta: { timestamp: new Date().toISOString() },
  });
});

// POST /:id/force-password-reset — Invalidate tokens, trigger password reset
adminUserRoutes.post('/:id/force-password-reset', async (c) => {
  const userId = c.req.param('id');
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  await authService.forgotPassword(user.email);

  return c.json<ApiResponse>({
    success: true,
    data: { message: 'Password reset email sent' },
    meta: { timestamp: new Date().toISOString() },
  });
});
