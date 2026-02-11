import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { adminGdprRoutes } from './gdpr';

// Mock auth middleware — role controlled via x-test-role header
vi.mock('../../middleware/auth', () => ({
  authMiddleware: () => {
    return async (c: any, next: any) => {
      const role = c.req.header('x-test-role') || 'admin';
      const user = {
        id: 'admin-1',
        tenantId: 'tenant-1',
        email: 'admin@test.com',
        role,
      };
      c.set('user', user);
      return next();
    };
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: (minRole: string) => {
    const hierarchy: Record<string, number> = { user: 0, moderator: 1, admin: 2 };
    return async (c: any, next: any) => {
      const user = c.get('user');
      if ((hierarchy[user.role] ?? 0) < hierarchy[minRole]) {
        return c.json(
          { success: false, error: { code: 'FORBIDDEN', message: `Requires ${minRole} role` } },
          403,
        );
      }
      return next();
    };
  },
}));

// Mock DB
const mockSelect = vi.fn();
vi.mock('../../../db/index', () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
  },
}));

// Mock user repository
const mockFindById = vi.fn();
vi.mock('../../../db/repositories/user.repository', () => ({
  userRepository: {
    findById: (...args: any[]) => mockFindById(...args),
  },
}));

// Mock GDPR service
const mockExecuteDeletion = vi.fn();
vi.mock('../../services/gdpr.service', () => ({
  gdprService: {
    executeDeletion: (...args: any[]) => mockExecuteDeletion(...args),
  },
}));

// Mock audit service
vi.mock('../../services/audit.service', () => ({
  auditService: {
    log: vi.fn(),
  },
}));

// Mock error handler for AppError
vi.mock('../../../core/errors', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return actual;
});

describe('Admin GDPR Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/admin/gdpr', adminGdprRoutes);
    // Simple error handler for tests
    app.onError((err: any, c) => {
      const status = err.statusCode || 500;
      return c.json(
        { success: false, error: { code: err.code || 'ERROR', message: err.message } },
        status,
      );
    });
    vi.clearAllMocks();
  });

  describe('GET /admin/gdpr/requests', () => {
    it('should list pending GDPR deletion requests for admin', async () => {
      const now = new Date();
      const mockItems = [
        {
          id: 'user-1',
          email: 'user1@test.com',
          displayName: 'User 1',
          deletionRequestedAt: now,
          createdAt: new Date('2026-01-01'),
        },
      ];

      // Mock the chained DB calls
      let selectCall = 0;
      mockSelect.mockImplementation(() => {
        selectCall++;
        if (selectCall === 1) {
          // Items query
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue(mockItems),
                  }),
                }),
              }),
            }),
          };
        }
        // Count query
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 1 }]),
          }),
        };
      });

      const res = await app.request('/admin/gdpr/requests?page=1&limit=20', {
        method: 'GET',
        headers: { 'x-test-role': 'admin' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].id).toBe('user-1');
      expect(body.data.items[0]).toHaveProperty('scheduledAt');
      expect(body.data.pagination.total).toBe(1);
      expect(body.data.pagination.page).toBe(1);
    });

    it('should return empty list when no pending requests', async () => {
      let selectCall = 0;
      mockSelect.mockImplementation(() => {
        selectCall++;
        if (selectCall === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue([]),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 0 }]),
          }),
        };
      });

      const res = await app.request('/admin/gdpr/requests?page=1&limit=20', {
        method: 'GET',
        headers: { 'x-test-role': 'admin' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.items).toHaveLength(0);
      expect(body.data.pagination.total).toBe(0);
    });

    it('should return 403 for non-admin users', async () => {
      const res = await app.request('/admin/gdpr/requests', {
        method: 'GET',
        headers: { 'x-test-role': 'user' },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  describe('POST /admin/gdpr/requests/:id/process', () => {
    it('should force-process a deletion request', async () => {
      const deletionDate = new Date('2026-02-01');
      mockFindById.mockResolvedValue({
        id: 'user-1',
        email: 'user1@test.com',
        deletionRequestedAt: deletionDate,
      });
      mockExecuteDeletion.mockResolvedValue(undefined);

      const res = await app.request('/admin/gdpr/requests/user-1/process', {
        method: 'POST',
        headers: { 'x-test-role': 'admin' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.userId).toBe('user-1');
      expect(mockExecuteDeletion).toHaveBeenCalledWith('user-1');
    });

    it('should return 404 for non-existent user', async () => {
      mockFindById.mockResolvedValue(null);

      const res = await app.request('/admin/gdpr/requests/nonexistent/process', {
        method: 'POST',
        headers: { 'x-test-role': 'admin' },
      });

      expect(res.status).toBe(404);
    });

    it('should return 400 if user has no pending deletion', async () => {
      mockFindById.mockResolvedValue({
        id: 'user-1',
        email: 'user1@test.com',
        deletionRequestedAt: null,
      });

      const res = await app.request('/admin/gdpr/requests/user-1/process', {
        method: 'POST',
        headers: { 'x-test-role': 'admin' },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('should return 403 for non-admin users', async () => {
      const res = await app.request('/admin/gdpr/requests/user-1/process', {
        method: 'POST',
        headers: { 'x-test-role': 'user' },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });
});
