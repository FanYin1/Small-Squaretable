/**
 * 用户路由测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { userRoutes } from './users';
import { userService } from '../services/user.service';
import { errorHandler } from '../middleware/error-handler';
import { NotFoundError, ValidationError } from '../../core/errors';

vi.mock('../services/user.service');

vi.mock('../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', {
      id: 'user-123',
      tenantId: 'tenant-123',
      email: 'test@example.com',
      displayName: 'Test User',
      avatarUrl: 'https://example.com/avatar.jpg',
    });
    c.set('tenantId', 'tenant-123');
    return next();
  },
  optionalAuthMiddleware: () => async (c: any, next: any) => {
    return next();
  },
}));

describe('User Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/users', userRoutes);
    app.onError(errorHandler);
    vi.clearAllMocks();
  });

  describe('GET /me', () => {
    it('should return current user profile', async () => {
      const mockFullUser = {
        id: 'user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        tenantId: 'tenant-123',
        isActive: true,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
      };

      vi.mocked(userService.getProfile).mockResolvedValue(mockFullUser as any);

      const res = await app.request('/api/v1/users/me', {
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('PATCH /me', () => {
    it('should update user profile', async () => {
      const updateData = {
        displayName: 'Updated Name',
        avatarUrl: 'https://example.com/new-avatar.jpg',
      };

      const mockUpdatedUser = {
        id: 'user-123',
        ...updateData,
        email: 'test@example.com',
        tenantId: 'tenant-123',
        isActive: true,
      };

      vi.mocked(userService.updateProfile).mockResolvedValue(mockUpdatedUser as any);

      const res = await app.request('/api/v1/users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
        },
        body: JSON.stringify(updateData),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 400 for invalid input', async () => {
      const res = await app.request('/api/v1/users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
        },
        body: JSON.stringify({
          displayName: '', // Invalid: empty string
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /me/password', () => {
    it('should update password successfully', async () => {
      const passwordData = {
        currentPassword: 'oldPassword123',
        newPassword: 'newPassword123',
      };

      vi.mocked(userService.updatePassword).mockResolvedValue(undefined);

      const res = await app.request('/api/v1/users/me/password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
        },
        body: JSON.stringify(passwordData),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 400 for invalid password', async () => {
      vi.mocked(userService.updatePassword).mockRejectedValue(
        new ValidationError('Current password is incorrect')
      );

      const res = await app.request('/api/v1/users/me/password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
        },
        body: JSON.stringify({
          currentPassword: 'wrongPassword',
          newPassword: 'newPassword123',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /me', () => {
    it('should delete user account', async () => {
      vi.mocked(userService.deleteAccount).mockResolvedValue(undefined);

      const res = await app.request('/api/v1/users/me', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should return 404 if user not found', async () => {
      vi.mocked(userService.deleteAccount).mockRejectedValue(new NotFoundError('User'));

      const res = await app.request('/api/v1/users/me', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer token',
        },
      });

      expect(res.status).toBe(404);
    });
  });
});
