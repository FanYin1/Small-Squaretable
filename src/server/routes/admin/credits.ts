/**
 * Admin Credits Routes (P3-1)
 *
 * 运营者手动充值、冲正、按账号查余额、充值/冲正记录。
 * All routes require authMiddleware() + requireRole('admin').
 *
 * 充值与冲正都写审计日志（见 credit.service），这里只做参数校验与响应封装。
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { creditService, MAX_TOPUP_POINTS } from '../../services/credit.service';
import { POINT_DECIMALS } from '../../services/credit-units';
import { paginationSchema, type ApiResponse } from '../../../types/api';

export const adminCreditRoutes = new Hono();

adminCreditRoutes.use('*', authMiddleware(), requireRole('admin'));

const listQuerySchema = paginationSchema.pick({ page: true, limit: true });

const lookupQuerySchema = z
  .object({
    userId: z.string().uuid().optional(),
    email: z.string().email().max(255).optional(),
  })
  .refine((v) => Boolean(v.userId) !== Boolean(v.email), 'Provide exactly one of userId or email');

const topUpSchema = z
  .object({
    userId: z.string().uuid().optional(),
    email: z.string().email().max(255).optional(),
    points: z.number().positive().max(MAX_TOPUP_POINTS),
    note: z.string().max(200).optional(),
    idempotencyKey: z.string().min(8).max(100),
  })
  .refine((v) => Boolean(v.userId) !== Boolean(v.email), 'Provide exactly one of userId or email')
  .refine(
    (v) => Math.abs(v.points * 10 ** POINT_DECIMALS - Math.round(v.points * 10 ** POINT_DECIMALS)) < 1e-6,
    `points supports at most ${POINT_DECIMALS} decimal places`,
  );

const reverseSchema = z.object({
  note: z.string().max(200).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

function actorOf(c: any) {
  const user = c.get('user');
  return {
    adminId: user.id as string,
    tenantId: user.tenantId as string,
    actorIp: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || undefined,
  };
}

// GET /lookup — 按账号查余额（充值前确认对象）
adminCreditRoutes.get('/lookup', zValidator('query', lookupQuerySchema), async (c) => {
  const data = await creditService.lookupUser(c.req.valid('query'));

  return c.json<ApiResponse>({
    success: true,
    data,
    meta: { timestamp: new Date().toISOString() },
  });
});

// POST /topups — 充值（幂等键防重复提交）
adminCreditRoutes.post('/topups', zValidator('json', topUpSchema), async (c) => {
  const body = c.req.valid('json');

  const result = await creditService.topUp(body, actorOf(c));

  return c.json<ApiResponse>(
    { success: true, data: result, meta: { timestamp: new Date().toISOString() } },
    result.replayed ? 200 : 201,
  );
});

// POST /entries/:id/reverse — 冲正一笔充值
adminCreditRoutes.post(
  '/entries/:id/reverse',
  zValidator('param', idParamSchema),
  zValidator('json', reverseSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const { note } = c.req.valid('json');

    const result = await creditService.reverse(id, { note }, actorOf(c));

    return c.json<ApiResponse>(
      { success: true, data: result, meta: { timestamp: new Date().toISOString() } },
      201,
    );
  },
);

// GET /entries — 充值 / 冲正记录（新的在前）
adminCreditRoutes.get('/entries', zValidator('query', listQuerySchema), async (c) => {
  const { page, limit } = c.req.valid('query');

  const result = await creditService.listOperatorEntries({ page, limit });
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
