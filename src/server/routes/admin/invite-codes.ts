/**
 * Admin Invite Code Routes
 *
 * 邀请码的批量生成、列表（含已用次数）、停用、使用记录追溯。
 * All routes require authMiddleware() + requireRole('admin').
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { inviteCodeService } from '../../services/invite-code.service';
import { paginationSchema, type ApiResponse } from '../../../types/api';

export const adminInviteCodeRoutes = new Hono();

adminInviteCodeRoutes.use('*', authMiddleware(), requireRole('admin'));

const MAX_BATCH = 100;

const generateSchema = z.object({
  count: z.number().int().min(1).max(MAX_BATCH).default(1),
  maxUses: z.number().int().min(1).max(100000).default(1),
  // 缺省 = 不过期。给了就必须是将来的时间，否则生成出来就是废码。
  expiresAt: z
    .string()
    .datetime()
    .transform((v) => new Date(v))
    .refine((d) => d.getTime() > Date.now(), 'expiresAt must be in the future')
    .optional(),
  note: z.string().max(200).optional(),
});

const listQuerySchema = paginationSchema.pick({ page: true, limit: true });

const idParamSchema = z.object({ id: z.string().uuid() });

function actorOf(c: any) {
  const user = c.get('user');
  return {
    adminId: user.id as string,
    tenantId: user.tenantId as string,
    actorIp: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || undefined,
  };
}

// POST / — 批量生成
adminInviteCodeRoutes.post('/', zValidator('json', generateSchema), async (c) => {
  const { count, maxUses, expiresAt, note } = c.req.valid('json');

  const codes = await inviteCodeService.generate({ count, maxUses, expiresAt, note }, actorOf(c));

  return c.json<ApiResponse>(
    { success: true, data: codes, meta: { timestamp: new Date().toISOString() } },
    201,
  );
});

// GET / — 列表（含 usedCount）
adminInviteCodeRoutes.get('/', zValidator('query', listQuerySchema), async (c) => {
  const { page, limit } = c.req.valid('query');

  const result = await inviteCodeService.list({ page, limit });

  const totalPages = Math.ceil(result.total / limit);

  return c.json<ApiResponse>({
    success: true,
    data: {
      items: result.items,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    },
    meta: { timestamp: new Date().toISOString() },
  });
});

// POST /:id/disable — 停用（已注册的账号不受影响）
adminInviteCodeRoutes.post('/:id/disable', zValidator('param', idParamSchema), async (c) => {
  const { id } = c.req.valid('param');

  const code = await inviteCodeService.disable(id, actorOf(c));

  return c.json<ApiResponse>({
    success: true,
    data: code,
    meta: { timestamp: new Date().toISOString() },
  });
});

// GET /:id/uses — 谁用了这个码
adminInviteCodeRoutes.get('/:id/uses', zValidator('param', idParamSchema), async (c) => {
  const { id } = c.req.valid('param');

  const uses = await inviteCodeService.listUses(id);

  return c.json<ApiResponse>({
    success: true,
    data: uses,
    meta: { timestamp: new Date().toISOString() },
  });
});
