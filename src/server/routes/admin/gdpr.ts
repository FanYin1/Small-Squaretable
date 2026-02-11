/**
 * Admin GDPR Oversight Routes
 *
 * GET  /gdpr/requests          — List pending export/deletion requests (paginated)
 * POST /gdpr/requests/:id/process — Force-process a deletion request (skip grace period)
 *
 * Requires: authMiddleware() + requireRole('admin')
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { gdprService } from '../../services/gdpr.service';
import { auditService } from '../../services/audit.service';
import { userRepository } from '../../../db/repositories/user.repository';
import { NotFoundError } from '../../../core/errors';
import { paginationSchema } from '../../../types/api';
import type { ApiResponse } from '../../../types/api';
import { db } from '../../../db/index';
import { users } from '../../../db/schema/users';
import { isNotNull, sql, desc } from 'drizzle-orm';

export const adminGdprRoutes = new Hono();

// All routes require admin role
adminGdprRoutes.use('*', authMiddleware(), requireRole('admin'));

const DELETION_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

// GET / — List users with pending deletion requests (paginated)
adminGdprRoutes.get(
  '/requests',
  zValidator('query', paginationSchema),
  async (c) => {
    const { page, limit } = c.req.valid('query');
    const offset = (page - 1) * limit;

    const [items, [{ count }]] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          deletionRequestedAt: users.deletionRequestedAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(isNotNull(users.deletionRequestedAt))
        .orderBy(desc(users.deletionRequestedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(isNotNull(users.deletionRequestedAt)),
    ]);

    const total = count;
    const totalPages = Math.ceil(total / limit);

    // Enrich with scheduledAt
    const enriched = items.map((item) => ({
      ...item,
      scheduledAt: item.deletionRequestedAt
        ? new Date(item.deletionRequestedAt.getTime() + DELETION_GRACE_PERIOD_MS).toISOString()
        : null,
    }));

    return c.json<ApiResponse>({
      success: true,
      data: {
        items: enriched,
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

// POST /requests/:id/process — Force-process a deletion (skip grace period)
adminGdprRoutes.post('/requests/:id/process', async (c) => {
  const userId = c.req.param('id');
  const currentUser = c.get('user');

  // Verify user exists and has a pending deletion
  const targetUser = await userRepository.findById(userId);
  if (!targetUser) {
    throw new NotFoundError('User');
  }
  if (!targetUser.deletionRequestedAt) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'User has no pending deletion request',
        },
        meta: { timestamp: new Date().toISOString() },
      },
      400,
    );
  }

  // Execute deletion immediately
  await gdprService.executeDeletion(userId);

  // Audit log
  const actorIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  auditService.log({
    tenantId: currentUser.tenantId,
    actorId: currentUser.id,
    actorIp,
    action: 'gdpr_force_delete',
    targetType: 'user',
    targetId: userId,
    metadata: { deletionRequestedAt: targetUser.deletionRequestedAt.toISOString() },
  });

  return c.json<ApiResponse>({
    success: true,
    data: { message: 'User deletion processed', userId },
    meta: { timestamp: new Date().toISOString() },
  });
});
