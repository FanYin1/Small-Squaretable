/**
 * Admin Content Moderation Routes
 *
 * GET routes: authMiddleware() + requireRole('moderator')
 * Action routes: authMiddleware() + requireRole('moderator')
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { moderationService } from '../../services/moderation.service';
import { notificationService } from '../../services/notification.service';
import { auditService } from '../../services/audit.service';
import { reportRepository } from '../../../db/repositories/report.repository';
import { NotFoundError } from '../../../core/errors';
import { paginationSchema } from '../../../types/api';
import { MODERATION_STATUSES, VIOLATION_CATEGORIES } from '../../../types/moderation';
import type { ApiResponse } from '../../../types/api';

export const adminContentRoutes = new Hono();

// All content moderation routes require at least moderator role
adminContentRoutes.use('*', authMiddleware(), requireRole('moderator'));

// 与 pgEnum 和前端选项同源，见 types/moderation.ts
const violationCategorySchema = z.enum(VIOLATION_CATEGORIES);

const resolveReportSchema = z.object({
  status: z.enum(['resolved', 'dismissed']),
  action: z.string().optional(),
  reason: z.string().optional(),
});

// 状态清单与 pgEnum 同源，见 types/moderation.ts
const moderationQueueSchema = paginationSchema.extend({
  status: z.enum(MODERATION_STATUSES).default('pending'),
});

const hideContentSchema = z.object({
  category: violationCategorySchema.optional(),
  reason: z.string().max(2000).optional(),
});

// 驳回的理由是必填的：作者要靠它知道改什么，trim 后为空同样不算填
const rejectContentSchema = z.object({
  category: violationCategorySchema.optional(),
  reason: z.string().trim().min(1).max(2000),
});

// GET /reports — List pending reports (paginated)
adminContentRoutes.get(
  '/reports',
  zValidator('query', paginationSchema),
  async (c) => {
    const { page, limit } = c.req.valid('query');
    const result = await moderationService.getPendingReports(page, limit);

    return c.json<ApiResponse>({
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  },
);

// GET /characters — 主动审核队列（默认 pending）
// 举报队列只覆盖「已经有人投诉」的内容；作者发布后角色是 pending，
// 公开入口要求 approved，没有这条路由这批内容不会出现在任何人的视野里。
adminContentRoutes.get(
  '/characters',
  zValidator('query', moderationQueueSchema),
  async (c) => {
    const { status, page, limit } = c.req.valid('query');
    const result = await moderationService.getCharactersByStatus(status, page, limit);

    return c.json<ApiResponse>({
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  },
);

// GET /reports/:id — Get report details
adminContentRoutes.get('/reports/:id', async (c) => {
  const reportId = c.req.param('id');
  const report = await reportRepository.findById(reportId);
  if (!report) {
    throw new NotFoundError('Report');
  }

  return c.json<ApiResponse>({
    success: true,
    data: report,
    meta: { timestamp: new Date().toISOString() },
  });
});

// POST /reports/:id/resolve — Resolve report
adminContentRoutes.post(
  '/reports/:id/resolve',
  zValidator('json', resolveReportSchema),
  async (c) => {
    const reportId = c.req.param('id');
    const user = c.get('user');
    const { status, action } = c.req.valid('json');

    // Fetch report to get reporterId for notification
    const report = await reportRepository.findById(reportId);

    await moderationService.resolveReport(reportId, user.id, status, action);

    // Audit content moderation
    const actorIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    auditService.log({
      tenantId: user.tenantId,
      actorId: user.id,
      actorIp,
      action: 'content_moderate',
      metadata: { reportId, status },
    });

    // Notify reporter that their report has been reviewed (fire-and-forget)
    if (report?.reporterId) {
      notificationService.notify({
        userId: report.reporterId,
        type: 'system',
        message: 'Your report has been reviewed and resolved. Thank you for helping keep our community safe.',
      }).catch(() => {});
    }

    return c.json<ApiResponse>({
      success: true,
      data: { message: 'Report resolved' },
      meta: { timestamp: new Date().toISOString() },
    });
  },
);

// POST /hide/:targetType/:targetId — Hide content
// 此前这个动作只写审核日志、不改任何业务状态，返回 200 而内容照常可见。
adminContentRoutes.post('/hide/:targetType/:targetId', async (c) => {
  const targetType = c.req.param('targetType');
  const targetId = c.req.param('targetId');
  const user = c.get('user');

  // 分类和理由可选：批量下架时未必逐条填写，但填了就会留给作者看
  const body = await c.req.json().catch(() => ({}));
  const parsed = hideContentSchema.safeParse(body);
  const { category, reason } = parsed.success ? parsed.data : {};

  await moderationService.takeAction(user.id, targetType, targetId, 'hide', reason, category);

  return c.json<ApiResponse>({
    success: true,
    data: { message: 'Content hidden' },
    meta: { timestamp: new Date().toISOString() },
  });
});

// POST /reject/:targetType/:targetId — 驳回（作者可修改后重新提交）
// 和 hide 的区别不是措辞：hide → 'hidden'，作者点发布也回不了审核队列；
// reject → 'rejected'，作者改完能重新提交。待审队列里用的是这一条。
adminContentRoutes.post('/reject/:targetType/:targetId', async (c) => {
  const targetType = c.req.param('targetType');
  const targetId = c.req.param('targetId');
  const user = c.get('user');

  const body = await c.req.json().catch(() => ({}));
  const parsed = rejectContentSchema.safeParse(body);
  if (!parsed.success) {
    // 理由会原样展示给作者，空理由等于没有解释
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'A rejection reason is required' },
        meta: { timestamp: new Date().toISOString() },
      },
      400,
    );
  }

  const { category, reason } = parsed.data;
  await moderationService.takeAction(user.id, targetType, targetId, 'reject', reason, category);

  return c.json<ApiResponse>({
    success: true,
    data: { message: 'Content rejected' },
    meta: { timestamp: new Date().toISOString() },
  });
});

// POST /unhide/:targetType/:targetId — Unhide content
adminContentRoutes.post('/unhide/:targetType/:targetId', async (c) => {
  const targetType = c.req.param('targetType');
  const targetId = c.req.param('targetId');
  const user = c.get('user');

  await moderationService.takeAction(user.id, targetType, targetId, 'approve');

  return c.json<ApiResponse>({
    success: true,
    data: { message: 'Content unhidden' },
    meta: { timestamp: new Date().toISOString() },
  });
});
