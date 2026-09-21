/**
 * Admin Routes Tests
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
    groupBy: vi.fn().mockReturnThis(),
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
    findByEmail: vi.fn(),
    update: vi.fn(),
  },
  UserRepository: vi.fn(),
}));

// Mock subscription repository
vi.mock('../../../db/repositories/subscription.repository', () => ({
  subscriptionRepository: {
    findByTenantId: vi.fn(),
  },
  SubscriptionRepository: vi.fn(),
}));


// Mock oauth repository
vi.mock('../../../db/repositories/oauth.repository', () => ({
  oauthRepository: {
    findByUserId: vi.fn(),
  },
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
  moderationRepository: {
    create: vi.fn(),
    findByTarget: vi.fn(),
  },
  ModerationRepository: vi.fn(),
}));

// Mock auth service
vi.mock('../../services/auth.service', () => ({
  authService: {
    forgotPassword: vi.fn(),
  },
}));

// Mock moderation service
vi.mock('../../services/moderation.service', () => ({
  moderationService: {
    getPendingReports: vi.fn(),
    getCharactersByStatus: vi.fn(),
    resolveReport: vi.fn(),
    takeAction: vi.fn(),
  },
  getModerationService: vi.fn(),
}));


// Helper to create mock auth middleware with a specific role
function mockAuthWithRole(role: 'user' | 'moderator' | 'admin', userId = 'admin-123') {
  return {
    authMiddleware: () => async (c: any, next: any) => {
      c.set('user', {
        id: userId,
        tenantId: 'tenant-123',
        email: 'admin@example.com',
        displayName: 'Admin User',
        avatarUrl: null,
        role,
      });
      c.set('tenantId', 'tenant-123');
      return next();
    },
  };
}

// Default: mock as admin
vi.mock('../../middleware/auth', () => mockAuthWithRole('admin'));

import { userRepository } from '../../../db/repositories/user.repository';
import { subscriptionRepository } from '../../../db/repositories/subscription.repository';
import { oauthRepository } from '../../../db/repositories/oauth.repository';
import { reportRepository } from '../../../db/repositories/report.repository';
import { authService } from '../../services/auth.service';
import { moderationService } from '../../services/moderation.service';
import { db } from '../../../db/index';


describe('Admin Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/admin', adminRoutes);
    app.onError(errorHandler);
    vi.clearAllMocks();
  });

  describe('Admin User Routes', () => {
    describe('GET /admin/users', () => {
      it('should list users with pagination', async () => {
        const mockUsers = [
          { id: 'u1', email: 'a@test.com', displayName: 'A', role: 'user', isActive: true, emailVerified: true, createdAt: new Date(), lastLoginAt: null, avatarUrl: null },
          { id: 'u2', email: 'b@test.com', displayName: 'B', role: 'admin', isActive: true, emailVerified: true, createdAt: new Date(), lastLoginAt: null, avatarUrl: null },
        ];

        // Mock the chained DB calls for list query
        const mockDb = db as any;
        let callCount = 0;
        mockDb.select.mockImplementation(() => {
          callCount++;
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue(callCount <= 1 ? mockUsers : undefined),
                  }),
                }),
                // For count query (no orderBy)
              }),
              // For count query without where
            }),
          };
        });

        // We need a different approach — mock at the Promise.all level
        // Since the DB mock is complex, let's simplify by mocking the whole chain
        // Reset and use a simpler approach
        mockDb.select.mockReset();

        // First call: items query
        const itemsChain = {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue(mockUsers),
                }),
              }),
            }),
          }),
        };

        // Second call: count query
        const countChain = {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 2 }]),
          }),
        };

        let selectCall = 0;
        mockDb.select.mockImplementation(() => {
          selectCall++;
          return selectCall === 1 ? itemsChain : countChain;
        });

        const res = await app.request('/api/v1/admin/users?page=1&limit=20');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data.items).toHaveLength(2);
        expect(data.data.pagination.total).toBe(2);
        expect(data.data.pagination.page).toBe(1);
      });
    });

    describe('GET /admin/users/:id', () => {
      it('should return user details with subscription and oauth', async () => {
        const mockUser = {
          id: 'u1',
          tenantId: 'tenant-123',
          email: 'user@test.com',
          displayName: 'Test',
          avatarUrl: null,
          role: 'user',
          isActive: true,
          emailVerified: true,
          passwordHash: 'secret',
          totpSecret: 'secret',
          emailVerificationToken: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLoginAt: null,
        };

        vi.mocked(userRepository.findById).mockResolvedValue(mockUser as any);
        vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue({
          id: 'sub-1', plan: 'pro', status: 'active',
        } as any);
        vi.mocked(oauthRepository.findByUserId).mockResolvedValue([
          { provider: 'github', providerAccountId: '123', createdAt: new Date() },
        ] as any);

        const res = await app.request('/api/v1/admin/users/u1');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data.user.email).toBe('user@test.com');
        // Sensitive fields should be stripped
        expect(data.data.user.passwordHash).toBeUndefined();
        expect(data.data.user.totpSecret).toBeUndefined();
        expect(data.data.subscription.plan).toBe('pro');
        expect(data.data.oauthAccounts).toHaveLength(1);
      });

      it('should return 404 for non-existent user', async () => {
        vi.mocked(userRepository.findById).mockResolvedValue(null);

        const res = await app.request('/api/v1/admin/users/nonexistent');
        expect(res.status).toBe(404);
      });
    });

    describe('PATCH /admin/users/:id/role', () => {
      it('should change user role', async () => {
        vi.mocked(userRepository.findById).mockResolvedValue({
          id: 'u1', role: 'user',
        } as any);
        vi.mocked(userRepository.update).mockResolvedValue({
          id: 'u1', role: 'moderator',
        } as any);

        const res = await app.request('/api/v1/admin/users/u1/role', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'moderator' }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data.role).toBe('moderator');
      });

      it('should prevent admin from changing own role', async () => {
        vi.mocked(userRepository.findById).mockResolvedValue({
          id: 'admin-123', role: 'admin',
        } as any);

        const res = await app.request('/api/v1/admin/users/admin-123/role', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'user' }),
        });

        expect(res.status).toBe(400);
      });
    });

    describe('POST /admin/users/:id/suspend', () => {
      it('should suspend a user', async () => {
        vi.mocked(userRepository.findById).mockResolvedValue({
          id: 'u1', isActive: true,
        } as any);
        vi.mocked(userRepository.update).mockResolvedValue({
          id: 'u1', isActive: false,
        } as any);

        const res = await app.request('/api/v1/admin/users/u1/suspend', {
          method: 'POST',
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.data.isActive).toBe(false);
      });

      it('should return 400 if user already suspended', async () => {
        vi.mocked(userRepository.findById).mockResolvedValue({
          id: 'u1', isActive: false,
        } as any);

        const res = await app.request('/api/v1/admin/users/u1/suspend', {
          method: 'POST',
        });

        expect(res.status).toBe(400);
      });
    });

    describe('POST /admin/users/:id/unsuspend', () => {
      it('should unsuspend a user', async () => {
        vi.mocked(userRepository.findById).mockResolvedValue({
          id: 'u1', isActive: false,
        } as any);
        vi.mocked(userRepository.update).mockResolvedValue({
          id: 'u1', isActive: true,
        } as any);

        const res = await app.request('/api/v1/admin/users/u1/unsuspend', {
          method: 'POST',
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.data.isActive).toBe(true);
      });
    });

    describe('POST /admin/users/:id/force-password-reset', () => {
      it('should trigger password reset', async () => {
        vi.mocked(userRepository.findById).mockResolvedValue({
          id: 'u1', email: 'user@test.com',
        } as any);
        vi.mocked(authService.forgotPassword).mockResolvedValue(undefined);

        const res = await app.request('/api/v1/admin/users/u1/force-password-reset', {
          method: 'POST',
        });

        expect(res.status).toBe(200);
        expect(authService.forgotPassword).toHaveBeenCalledWith('user@test.com');
      });
    });
  });
  describe('Admin Content Routes', () => {
    describe('GET /admin/content/reports', () => {
      it('should list pending reports', async () => {
        const mockResult = {
          items: [
            { id: 'r1', targetType: 'character', targetId: 't1', reason: 'spam', status: 'pending' },
          ],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
        };

        vi.mocked(moderationService.getPendingReports).mockResolvedValue(mockResult as any);

        const res = await app.request('/api/v1/admin/content/reports?page=1&limit=20');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data.items).toHaveLength(1);
      });
    });

    // 举报队列是被动的：只有被举报过的内容才进得去。发布后角色是 'pending'，
    // 公开入口要求 'approved'，没有这条主动队列这批内容谁都看不到。
    describe('GET /admin/content/characters', () => {
      const queuePage = {
        items: [{ id: 'char-1', name: 'A', moderationStatus: 'pending' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      };

      it('lists characters awaiting review by default', async () => {
        vi.mocked(moderationService.getCharactersByStatus).mockResolvedValue(queuePage as any);

        const res = await app.request('/api/v1/admin/content/characters');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data.items).toHaveLength(1);
        expect(moderationService.getCharactersByStatus).toHaveBeenCalledWith('pending', 1, 20);
      });

      it('honours the status filter so rejected content can be revisited', async () => {
        vi.mocked(moderationService.getCharactersByStatus).mockResolvedValue(queuePage as any);

        const res = await app.request('/api/v1/admin/content/characters?status=rejected&page=2&limit=50');
        expect(res.status).toBe(200);
        expect(moderationService.getCharactersByStatus).toHaveBeenCalledWith('rejected', 2, 50);
      });

      it('rejects an unknown status at the boundary instead of passing it to the query', async () => {
        const res = await app.request('/api/v1/admin/content/characters?status=bogus');
        expect(res.status).toBe(400);
        expect(moderationService.getCharactersByStatus).not.toHaveBeenCalled();
      });
    });

    describe('GET /admin/content/reports/:id', () => {
      it('should return report details', async () => {
        vi.mocked(reportRepository.findById).mockResolvedValue({
          id: 'r1', targetType: 'character', targetId: 't1', reason: 'spam', status: 'pending',
        } as any);

        const res = await app.request('/api/v1/admin/content/reports/r1');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.data.id).toBe('r1');
      });

      it('should return 404 for non-existent report', async () => {
        vi.mocked(reportRepository.findById).mockResolvedValue(null);

        const res = await app.request('/api/v1/admin/content/reports/nonexistent');
        expect(res.status).toBe(404);
      });
    });

    describe('POST /admin/content/reports/:id/resolve', () => {
      it('should resolve a report', async () => {
        vi.mocked(moderationService.resolveReport).mockResolvedValue(undefined);

        const res = await app.request('/api/v1/admin/content/reports/r1/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'resolved', action: 'hide' }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(moderationService.resolveReport).toHaveBeenCalledWith('r1', 'admin-123', 'resolved', 'hide');
      });
    });

    describe('POST /admin/content/hide/:targetType/:targetId', () => {
      it('should hide content', async () => {
        vi.mocked(moderationService.takeAction).mockResolvedValue(undefined);

        const res = await app.request('/api/v1/admin/content/hide/character/char-1', {
          method: 'POST',
        });

        expect(res.status).toBe(200);
        // 无 body 时分类和理由为 undefined——批量下架不强制逐条填写
        expect(moderationService.takeAction).toHaveBeenCalledWith(
          'admin-123', 'character', 'char-1', 'hide', undefined, undefined,
        );
      });

      // 分类会落到 characters.violation_category，是审核统计的口径来源
      it('forwards the violation category and reason when supplied', async () => {
        vi.mocked(moderationService.takeAction).mockResolvedValue(undefined);

        const res = await app.request('/api/v1/admin/content/hide/character/char-1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: 'violence', reason: '过度暴力描写' }),
        });

        expect(res.status).toBe(200);
        expect(moderationService.takeAction).toHaveBeenCalledWith(
          'admin-123', 'character', 'char-1', 'hide', '过度暴力描写', 'violence',
        );
      });
    });

    // 驳回和下架不是一回事：hide → 'hidden'，作者无法自行撤销；
    // 队列里的驳回必须是 'rejected'，作者改完能重新提交。
    describe('POST /admin/content/reject/:targetType/:targetId', () => {
      it('dispatches the reject action so the author can resubmit', async () => {
        vi.mocked(moderationService.takeAction).mockResolvedValue(undefined);

        const res = await app.request('/api/v1/admin/content/reject/character/char-1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: 'pornography', reason: '含明确性描写' }),
        });

        expect(res.status).toBe(200);
        expect(moderationService.takeAction).toHaveBeenCalledWith(
          'admin-123', 'character', 'char-1', 'reject', '含明确性描写', 'pornography',
        );
      });

      // 理由会原样展示给作者，空理由等于没有解释
      it('rejects an empty reason at the boundary', async () => {
        vi.mocked(moderationService.takeAction).mockResolvedValue(undefined);

        const res = await app.request('/api/v1/admin/content/reject/character/char-1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: '   ' }),
        });

        expect(res.status).toBe(400);
        expect(moderationService.takeAction).not.toHaveBeenCalled();
      });

      it('accepts a reason without a category', async () => {
        vi.mocked(moderationService.takeAction).mockResolvedValue(undefined);

        const res = await app.request('/api/v1/admin/content/reject/character/char-1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: '设定与公开规范不符' }),
        });

        expect(res.status).toBe(200);
        expect(moderationService.takeAction).toHaveBeenCalledWith(
          'admin-123', 'character', 'char-1', 'reject', '设定与公开规范不符', undefined,
        );
      });
    });

    describe('POST /admin/content/unhide/:targetType/:targetId', () => {
      it('should unhide content', async () => {
        vi.mocked(moderationService.takeAction).mockResolvedValue(undefined);

        const res = await app.request('/api/v1/admin/content/unhide/character/char-1', {
          method: 'POST',
        });

        expect(res.status).toBe(200);
        expect(moderationService.takeAction).toHaveBeenCalledWith('admin-123', 'character', 'char-1', 'approve');
      });
    });
  });
  describe('Admin System Routes', () => {
    describe('GET /admin/system/stats', () => {
      it('should return system stats with correct shape', async () => {
        const mockDb = db as any;

        // The stats endpoint makes 7 parallel DB queries
        // We need to mock each select() call in sequence
        let selectCall = 0;
        mockDb.select.mockImplementation(() => {
          selectCall++;
          const chain: any = {};
          chain.from = vi.fn().mockImplementation(() => {
            const fromChain: any = {};
            fromChain.where = vi.fn().mockImplementation(() => {
              // Queries 2, 6, 7 have where clauses
              if (selectCall === 2) return Promise.resolve([{ activeUsers: 50 }]);
              if (selectCall === 6) return Promise.resolve([{ recentSignups: 10 }]);
              if (selectCall === 7) return Promise.resolve([{ pendingReports: 3 }]);
              return Promise.resolve([]);
            });
            fromChain.groupBy = vi.fn().mockResolvedValue([
              { plan: 'free', count: 80 },
              { plan: 'pro', count: 15 },
              { plan: 'team', count: 5 },
            ]);

            // Queries without where: 1, 3, 4
            if (selectCall === 1) return Promise.resolve([{ totalUsers: 100 }]);
            if (selectCall === 3) return Promise.resolve([{ totalCharacters: 500 }]);
            if (selectCall === 4) return Promise.resolve([{ totalChats: 2000 }]);
            // Query 5 uses groupBy
            if (selectCall === 5) return fromChain;

            return fromChain;
          });
          return chain;
        });

        const res = await app.request('/api/v1/admin/system/stats');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.data).toHaveProperty('totalUsers');
        expect(data.data).toHaveProperty('activeUsers');
        expect(data.data).toHaveProperty('totalCharacters');
        expect(data.data).toHaveProperty('totalChats');
        expect(data.data).toHaveProperty('subscriptionBreakdown');
        expect(data.data).toHaveProperty('recentSignups');
        expect(data.data).toHaveProperty('pendingReports');
        expect(data.data.subscriptionBreakdown).toHaveProperty('free');
        expect(data.data.subscriptionBreakdown).toHaveProperty('pro');
        expect(data.data.subscriptionBreakdown).toHaveProperty('team');
      });
    });
  });
  describe('RBAC enforcement', () => {
    it('user role gets 403 on admin user routes', async () => {
      // Create a separate app with user-role auth
      const userApp = new Hono();

      // We need to test with a user role — create inline routes with user-role middleware
      const { Hono: HonoClass } = await import('hono');
      const { requireRole: realRequireRole } = await import('../../middleware/rbac');

      const testRoutes = new HonoClass();
      // Simulate authMiddleware setting a user with 'user' role
      testRoutes.use('*', async (c, next) => {
        c.set('user', {
          id: 'regular-user',
          tenantId: 'tenant-123',
          email: 'user@test.com',
          displayName: 'Regular User',
          avatarUrl: null,
          role: 'user',
        });
        return next();
      });
      testRoutes.use('*', realRequireRole('admin'));
      testRoutes.get('/test', (c) => c.json({ ok: true }));

      userApp.route('/admin', testRoutes);
      userApp.onError(errorHandler);

      const res = await userApp.request('/admin/test');
      expect(res.status).toBe(403);
    });

    it('moderator role gets 403 on admin-only routes', async () => {
      const modApp = new Hono();
      const { Hono: HonoClass } = await import('hono');
      const { requireRole: realRequireRole } = await import('../../middleware/rbac');

      const testRoutes = new HonoClass();
      testRoutes.use('*', async (c, next) => {
        c.set('user', {
          id: 'mod-user',
          tenantId: 'tenant-123',
          email: 'mod@test.com',
          displayName: 'Mod User',
          avatarUrl: null,
          role: 'moderator',
        });
        return next();
      });
      testRoutes.use('*', realRequireRole('admin'));
      testRoutes.get('/test', (c) => c.json({ ok: true }));

      modApp.route('/admin', testRoutes);
      modApp.onError(errorHandler);

      const res = await modApp.request('/admin/test');
      expect(res.status).toBe(403);
    });

    it('moderator role can access content moderation routes', async () => {
      const modApp = new Hono();
      const { Hono: HonoClass } = await import('hono');
      const { requireRole: realRequireRole } = await import('../../middleware/rbac');

      const testRoutes = new HonoClass();
      testRoutes.use('*', async (c, next) => {
        c.set('user', {
          id: 'mod-user',
          tenantId: 'tenant-123',
          email: 'mod@test.com',
          displayName: 'Mod User',
          avatarUrl: null,
          role: 'moderator',
        });
        return next();
      });
      testRoutes.use('*', realRequireRole('moderator'));
      testRoutes.get('/test', (c) => c.json({ ok: true }));

      modApp.route('/content', testRoutes);
      modApp.onError(errorHandler);

      const res = await modApp.request('/content/test');
      expect(res.status).toBe(200);
    });
  });
});
