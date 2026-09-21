/**
 * Reports Routes
 *
 * User-facing endpoint for submitting content reports.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { moderationService } from '../services/moderation.service';
import { auditService } from '../services/audit.service';
import { VIOLATION_CATEGORIES, REPORT_TARGET_TYPES, REPORT_REASON_MAX_LENGTH } from '../../types/moderation';
import type { ApiResponse } from '../../types/api';

export const reportRoutes = new Hono();

// 枚举取自 types/moderation.ts，与 pgEnum 和前端选项同源
const submitReportSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: z.string().uuid(),
  // 分类必填：此前只有自由文本 reason，审核后台拿不到可统计的违规口径
  category: z.enum(VIOLATION_CATEGORIES),
  reason: z.string().min(1).max(REPORT_REASON_MAX_LENGTH),
});

// POST / — Submit a report (requires auth)
reportRoutes.post(
  '/',
  authMiddleware(),
  zValidator('json', submitReportSchema),
  async (c) => {
    const user = c.get('user');
    const { targetType, targetId, category, reason } = c.req.valid('json');

    const report = await moderationService.submitReport(
      user.id,
      targetType,
      targetId,
      reason,
      category,
    );

    // Audit report submission
    const actorIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    auditService.log({
      tenantId: user.tenantId,
      actorId: user.id,
      actorIp,
      action: 'report_submit',
      metadata: { targetType, targetId, category },
    });

    return c.json<ApiResponse>(
      {
        success: true,
        data: report,
        meta: { timestamp: new Date().toISOString() },
      },
      201,
    );
  },
);
