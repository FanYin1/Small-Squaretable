import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { adminAuditRoutes } from './audit';

// Mock auth middleware to inject user
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
        return c.json({ success: false, error: { code: 'FORBIDDEN', message: `Requires ${minRole} role` } }, 403);
      }
      return next();
    };
  },
}));

const mockFindAll = vi.fn();
vi.mock('../../services/audit.service', () => ({
  auditService: {
    findAll: (...args: any[]) => mockFindAll(...args),
  },
}));

describe('Admin Audit Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/admin/audit-logs', adminAuditRoutes);
    vi.clearAllMocks();
  });

  describe('GET /admin/audit-logs', () => {
    it('should return paginated audit logs for admin', async () => {
      const mockData = {
        items: [
          { id: 'log-1', tenantId: 'tenant-1', actorId: 'user-1', action: 'login', metadata: {} },
          { id: 'log-2', tenantId: 'tenant-2', actorId: 'user-2', action: 'logout', metadata: {} },
        ],
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1, hasNext: false, hasPrev: false },
      };
      mockFindAll.mockResolvedValue(mockData);

      const res = await app.request('/admin/audit-logs?page=1&limit=20', {
        method: 'GET',
        headers: { 'x-test-role': 'admin' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.items).toHaveLength(2);
      expect(body.data.pagination.total).toBe(2);
      expect(mockFindAll).toHaveBeenCalledWith({}, { page: 1, limit: 20 });
    });

    it('should filter by action', async () => {
      mockFindAll.mockResolvedValue({
        items: [{ id: 'log-1', action: 'login' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      });

      const res = await app.request('/admin/audit-logs?action=login', {
        method: 'GET',
        headers: { 'x-test-role': 'admin' },
      });

      expect(res.status).toBe(200);
      expect(mockFindAll).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'login' }),
        expect.any(Object),
      );
    });

    it('should filter by actorId', async () => {
      mockFindAll.mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      });

      const res = await app.request('/admin/audit-logs?actorId=user-1', {
        method: 'GET',
        headers: { 'x-test-role': 'admin' },
      });

      expect(res.status).toBe(200);
      expect(mockFindAll).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: 'user-1' }),
        expect.any(Object),
      );
    });

    it('should filter by date range', async () => {
      mockFindAll.mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      });

      const dateFrom = '2026-01-01T00:00:00+00:00';
      const dateTo = '2026-02-01T00:00:00+00:00';
      const res = await app.request(
        `/admin/audit-logs?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
        { method: 'GET', headers: { 'x-test-role': 'admin' } },
      );

      expect(res.status).toBe(200);
      expect(mockFindAll).toHaveBeenCalledWith(
        expect.objectContaining({
          dateFrom: expect.any(Date),
          dateTo: expect.any(Date),
        }),
        expect.any(Object),
      );
    });

    it('should return 403 for non-admin users', async () => {
      const res = await app.request('/admin/audit-logs', {
        method: 'GET',
        headers: { 'x-test-role': 'user' },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('should support pagination params', async () => {
      mockFindAll.mockResolvedValue({
        items: [],
        pagination: { page: 3, limit: 10, total: 50, totalPages: 5, hasNext: true, hasPrev: true },
      });

      const res = await app.request('/admin/audit-logs?page=3&limit=10', {
        method: 'GET',
        headers: { 'x-test-role': 'admin' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.pagination.page).toBe(3);
      expect(mockFindAll).toHaveBeenCalledWith({}, { page: 3, limit: 10 });
    });
  });
});