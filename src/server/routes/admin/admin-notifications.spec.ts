/**
 * Admin Action Notifications Tests
 *
 * Verifies that admin actions (suspend, unsuspend, role change, report resolve)
 * send notifications to affected users.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { adminRoutes } from './index';
import { errorHandler } from '../../middleware/error-handler';

// Mock DB
vi.mock('../../../db/index', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}));

// Mock user repository
vi.mock('../../../db/repositories/user.repository', () => ({
  userRepository: {
    findById: vi.fn(),
    update: vi.fn(),
  },
  UserRepository: vi.fn(),
}));

// Mock subscription repository
vi.mock('../../../db/repositories/subscription.repository', () => ({
  subscriptionRepository: { findByTenantId: vi.fn() },
  SubscriptionRepository: vi.fn(),
}));

// Mock oauth repository
vi.mock('../../../db/repositories/oauth.repository', () => ({
  oauthRepository: { findByUserId: vi.fn() },
  OAuthRepository: vi.fn(),
}));

// Mock report repository
vi.mock('../../../db/repositories/report.repository', () => ({
  reportRepository: {
    findById: vi.fn(),
    findPending: vi.fn(),
    resolve: vi.fn(),
  },
  ReportRepository: vi.fn(),
}));

// Mock moderation repository
vi.mock('../../../db/repositories/moderation.repository', () => ({
  moderationRepository: { create: vi.fn(), findByTarget: vi.fn() },
  ModerationRepository: vi.fn(),
}));

// Mock auth service
vi.mock('../../services/auth.service', () => ({
  authService: { forgotPassword: vi.fn() },
}));

// Mock moderation service
vi.mock('../../services/moderation.service', () => ({
  moderationService: {
    getPendingReports: vi.fn(),
    resolveReport: vi.fn(),
    takeAction: vi.fn(),
  },
  getModerationService: vi.fn(),
}));

// Mock notification service
vi.mock('../../services/notification.service', () => ({
  notificationService: {
    notify: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock auth middleware as admin
vi.mock('../../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', {
      id: 'admin-123',
      tenantId: 'tenant-123',
      email: 'admin@example.com',
      displayName: 'Admin User',
      avatarUrl: null,
      role: 'admin',
    });
    c.set('tenantId', 'tenant-123');
    return next();
  },
}));

import { userRepository } from '../../../db/repositories/user.repository';
import { reportRepository } from '../../../db/repositories/report.repository';
import { moderationService } from '../../services/moderation.service';
import { notificationService } from '../../services/notification.service';

describe('Admin Action Notifications', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/admin', adminRoutes);
    app.onError(errorHandler);
    vi.clearAllMocks();
  });

  it('should notify suspended user', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue({
      id: 'u1',
      isActive: true,
    } as any);
    vi.mocked(userRepository.update).mockResolvedValue({
      id: 'u1',
      isActive: false,
    } as any);

    const res = await app.request('/api/v1/admin/users/u1/suspend', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    expect(notificationService.notify).toHaveBeenCalledWith({
      userId: 'u1',
      type: 'system',
      message: 'Your account has been suspended. Please contact support for more information.',
    });
  });

  it('should notify reporter when report is resolved', async () => {
    vi.mocked(reportRepository.findById).mockResolvedValue({
      id: 'r1',
      reporterId: 'reporter-456',
      targetType: 'character',
      targetId: 't1',
      reason: 'spam',
      status: 'pending',
    } as any);
    vi.mocked(moderationService.resolveReport).mockResolvedValue(undefined);

    const res = await app.request('/api/v1/admin/content/reports/r1/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved', action: 'hide' }),
    });

    expect(res.status).toBe(200);
    expect(notificationService.notify).toHaveBeenCalledWith({
      userId: 'reporter-456',
      type: 'system',
      message: 'Your report has been reviewed and resolved. Thank you for helping keep our community safe.',
    });
  });
});
