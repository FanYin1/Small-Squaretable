/**
 * GDPR Routes
 *
 * User-facing endpoints for GDPR compliance:
 * - Data export (Right of Access)
 * - Account deletion (Right to Erasure)
 * Mounted at /api/v1/account.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { gdprService } from '../services/gdpr.service';
import { auditService } from '../services/audit.service';

export const gdprRoutes = new Hono();

// Rate limit: 1 export per 24 hours per user
const exportRateLimit = rateLimit({
  limit: 1,
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  keyGenerator: (c: any) => {
    const user = c.get('user');
    return `gdpr-export:${user?.id ?? 'unknown'}`;
  },
  message: 'Data export is limited to once per 24 hours. Please try again later.',
});

// POST /export — Generate and download a ZIP of all user data
gdprRoutes.post('/export', authMiddleware(), exportRateLimit, async (c) => {
  const user = c.get('user');
  const tenantId = c.get('tenantId');

  const zipBuffer = await gdprService.exportUserData(user.id, tenantId);

  // Audit log
  auditService.log({
    tenantId,
    actorId: user.id,
    actorIp: c.req.header('x-forwarded-for')?.split(',')[0] || c.req.header('x-real-ip'),
    action: 'data_export',
    targetType: 'user',
    targetId: user.id,
    metadata: { sizeBytes: zipBuffer.length },
  });

  return new Response(zipBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="data-export-${user.id}.zip"`,
      'Content-Length': zipBuffer.length.toString(),
    },
  });
});

// Rate limit: 3 deletion requests per 24 hours per user
const deletionRateLimit = rateLimit({
  limit: 3,
  windowMs: 24 * 60 * 60 * 1000,
  keyGenerator: (c: any) => {
    const user = c.get('user');
    return `gdpr-delete:${user?.id ?? 'unknown'}`;
  },
  message: 'Too many deletion requests. Please try again later.',
});

const deleteRequestSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

// POST /delete — Request account deletion
gdprRoutes.post('/delete', authMiddleware(), deletionRateLimit, async (c) => {
  const user = c.get('user');
  const tenantId = c.get('tenantId');

  const body = await c.req.json();
  const parsed = deleteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Password is required' }, 400);
  }

  const result = await gdprService.requestDeletion(user.id, tenantId, parsed.data.password);

  return c.json({
    message: 'Account deletion requested. You have 30 days to cancel.',
    scheduledAt: result.scheduledAt.toISOString(),
  });
});

// POST /delete/cancel — Cancel pending deletion
gdprRoutes.post('/delete/cancel', authMiddleware(), async (c) => {
  const user = c.get('user');
  const tenantId = c.get('tenantId');

  await gdprService.cancelDeletion(user.id, tenantId);

  return c.json({ message: 'Account deletion cancelled.' });
});

// GET /delete/status — Check deletion status
gdprRoutes.get('/delete/status', authMiddleware(), async (c) => {
  const user = c.get('user');

  const status = await gdprService.getDeletionStatus(user.id);

  return c.json(status);
});
