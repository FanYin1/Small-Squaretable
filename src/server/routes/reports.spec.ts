import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock auth middleware
vi.mock('../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', {
      id: 'user-123',
      tenantId: 'tenant-123',
      email: 'test@example.com',
      displayName: 'Test User',
      avatarUrl: null,
      role: 'user',
    });
    return next();
  },
}));

vi.mock('../services/moderation.service', () => ({
  moderationService: {
    submitReport: vi.fn(),
  },
}));

vi.mock('../services/audit.service', () => ({
  auditService: {
    log: vi.fn(),
  },
}));

import { reportRoutes } from './reports';
import { moderationService } from '../services/moderation.service';
import { auditService } from '../services/audit.service';

describe('Report Routes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/reports', reportRoutes);
  });

  describe('POST /reports', () => {
    const validPayload = {
      targetType: 'character' as const,
      targetId: '550e8400-e29b-41d4-a716-446655440000',
      // 分类必填：审核后台需要可统计的违规口径，不能只有自由文本
      category: 'pornography' as const,
      reason: 'Inappropriate content',
    };

    it('should return 201 and call submitReport with valid input', async () => {
      const mockReport = { id: 'report-1', ...validPayload, reporterId: 'user-123', status: 'pending' };
      vi.mocked(moderationService.submitReport).mockResolvedValue(mockReport as any);

      const res = await app.request('/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockReport);
      expect(moderationService.submitReport).toHaveBeenCalledWith(
        'user-123',
        'character',
        '550e8400-e29b-41d4-a716-446655440000',
        'Inappropriate content',
        'pornography',
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-123',
          actorId: 'user-123',
          action: 'report_submit',
          metadata: {
            targetType: 'character',
            targetId: '550e8400-e29b-41d4-a716-446655440000',
            category: 'pornography',
          },
        }),
      );
    });

    it('should return 400 when the category is missing', async () => {
      const { category: _, ...noCategory } = validPayload;
      const res = await app.request('/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noCategory),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 with an unknown category', async () => {
      const res = await app.request('/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validPayload, category: 'not-a-category' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 with invalid targetType', async () => {
      const res = await app.request('/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validPayload, targetType: 'invalid' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 with missing reason', async () => {
      const { reason: _, ...noReason } = validPayload;
      const res = await app.request('/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noReason),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 with non-UUID targetId', async () => {
      const res = await app.request('/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validPayload, targetId: 'not-a-uuid' }),
      });

      expect(res.status).toBe(400);
    });
  });
});
