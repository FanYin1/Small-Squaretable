/**
 * GDPR Routes
 *
 * User-facing endpoints for GDPR data export (Right of Access).
 * Mounted at /api/v1/account.
 */

import { Hono } from 'hono';
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
