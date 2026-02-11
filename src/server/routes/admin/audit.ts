/**
 * Admin Audit Log Routes
 *
 * GET /audit-logs — Query audit logs with filters and pagination.
 * Requires: authMiddleware() + requireRole('admin')
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { auditService } from '../../services/audit.service';
import { paginationSchema } from '../../../types/api';
import type { ApiResponse } from '../../../types/api';

export const adminAuditRoutes = new Hono();

// All audit routes require admin role
adminAuditRoutes.use('*', authMiddleware(), requireRole('admin'));

const auditQuerySchema = paginationSchema.extend({
  actorId: z.string().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
});

// GET /audit-logs — List audit logs (paginated, filterable)
adminAuditRoutes.get(
  '/',
  zValidator('query', auditQuerySchema),
  async (c) => {
    const { page, limit, actorId, action, targetType, dateFrom, dateTo } = c.req.valid('query');

    const filters = {
      ...(actorId && { actorId }),
      ...(action && { action }),
      ...(targetType && { targetType }),
      ...(dateFrom && { dateFrom: new Date(dateFrom) }),
      ...(dateTo && { dateTo: new Date(dateTo) }),
    };

    const result = await auditService.findAll(filters, { page, limit });

    return c.json<ApiResponse>({
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  },
);
