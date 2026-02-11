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
import { auditService } from '../../services/audit.service';
import { reportRepository } from '../../../db/repositories/report.repository';
import { NotFoundError } from '../../../core/errors';
import { paginationSchema } from '../../../types/api';
import type { ApiResponse } from '../../../types/api';

export const adminContentRoutes = new Hono();

// All content moderation routes require at least moderator role
adminContentRoutes.use('*', authMiddleware(), requireRole('moderator'));

const resolveReportSchema = z.object({
  status: z.enum(['resolved', 'dismissed']),
  action: z.string().optional(),
  reason: z.string().optional(),
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

    return c.json<ApiResponse>({
      success: true,
      data: { message: 'Report resolved' },
      meta: { timestamp: new Date().toISOString() },
    });
  },
);

// POST /hide/:targetType/:targetId — Hide content
adminContentRoutes.post('/hide/:targetType/:targetId', async (c) => {
  const targetType = c.req.param('targetType');
  const targetId = c.req.param('targetId');
  const user = c.get('user');

  await moderationService.takeAction(user.id, targetType, targetId, 'hide');

  return c.json<ApiResponse>({
    success: true,
    data: { message: 'Content hidden' },
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
