/**
 * User Credits Routes (P3-1)
 *
 * 用户查看自己的点数余额与流水。充值由运营者在后台操作（见 admin/credits.ts），
 * 这里没有任何写入口。余额按租户计（和 usage-meter 的计量主体一致）。
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { creditService } from '../services/credit.service';
import { tokensToPoints } from '../services/credit-units';
import { config } from '../../core/config';
import { paginationSchema, type ApiResponse } from '../../types/api';
import type { CreditLedgerEntry } from '../../db/schema/credits';
import { creditActivityQuerySchema, creditKindSchema, creditRangeShape, recordedCreditUsage, validateCreditRange } from '../../types/credit-activity';

export const creditRoutes = new Hono();

const listQuerySchema = paginationSchema.pick({ page: true, limit: true }).extend({ chatId: z.string().uuid().optional(),
  kind: creditKindSchema.optional(), from: creditRangeShape.from.optional(), to: creditRangeShape.to.optional(),
}).superRefine(validateCreditRange);

/**
 * 只暴露用户需要看的字段：运营者 id、幂等键、运营备注是内部信息，不返回。
 * 充值 / 冲正的备注同样不返回，避免运营者的内部说明泄露给用户。
 */
function toPublicEntry(entry: CreditLedgerEntry) {
  const usage = recordedCreditUsage(entry.metadata);
  return {
    id: entry.id,
    kind: entry.kind,
    tokens: entry.amount,
    points: tokensToPoints(entry.amount),
    chatId: entry.chatId,
    messageId: entry.messageId,
    ...(usage ?? {}),
    createdAt: entry.createdAt,
  };
}

// GET /balance — 余额概览（billingMode 让前端知道是否展示点数区块）
creditRoutes.get('/balance', authMiddleware(), async (c) => {
  const user = c.get('user');
  const summary = await creditService.getSummary(user.tenantId);

  return c.json<ApiResponse>({
    success: true,
    data: { billingMode: config.billingMode, ...summary },
    meta: { timestamp: new Date().toISOString() },
  });
});

// GET /ledger — 流水（新的在前）
creditRoutes.get('/ledger', authMiddleware(), zValidator('query', listQuerySchema), async (c) => {
  const user = c.get('user');
  const { page, limit, ...filters } = c.req.valid('query');

  const result = await creditService.listLedger(user.tenantId, { page, limit, ...filters });
  const totalPages = Math.ceil(result.total / limit);

  return c.json<ApiResponse>({
    success: true,
    data: {
      items: result.items.map(toPublicEntry),
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

creditRoutes.get('/activity', authMiddleware(), zValidator('query', creditActivityQuerySchema), async (c) => {
  const result = await creditService.getActivity(c.get('user').tenantId, c.req.valid('query'));
  return c.json<ApiResponse>({ success: true, data: result, meta: { timestamp: new Date().toISOString() } });
});
