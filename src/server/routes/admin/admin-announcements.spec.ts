/**
 * Admin Announcements Routes Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

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
    values: vi.fn().mockResolvedValue([]),
  },
}));

// Mock auth middleware — admin role
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

import { adminSystemRoutes } from './system';
import { db } from '../../../db/index';
import { errorHandler } from '../../middleware/error-handler';

describe('Admin Announcements', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/admin/system', adminSystemRoutes);
    app.onError(errorHandler);
    vi.clearAllMocks();
  });

  describe('POST /system/announcements', () => {
    it('should create notifications for all users', async () => {
      const mockDb = db as any;

      const mockUsers = [
        { id: 'user-1' },
        { id: 'user-2' },
        { id: 'user-3' },
      ];

      // Mock select().from(users) to return user IDs
      mockDb.select.mockReturnValue({
        from: vi.fn().mockResolvedValue(mockUsers),
      });

      // Mock insert().values() chain
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue([]),
      });

      const res = await app.request('/api/v1/admin/system/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'System maintenance tonight' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.recipientCount).toBe(3);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should return 400 for empty message', async () => {
      const res = await app.request('/api/v1/admin/system/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '' }),
      });

      expect(res.status).toBe(400);
    });
  });
});
