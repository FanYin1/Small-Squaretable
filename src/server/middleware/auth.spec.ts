import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware, optionalAuthMiddleware } from './auth';
import { errorHandler } from './error-handler';

vi.mock('../../core/jwt', () => ({
  verifyAccessToken: vi.fn(),
  extractTokenFromHeader: vi.fn((header) => {
    if (!header || !header.startsWith('Bearer ')) return null;
    return header.slice(7);
  }),
}));

vi.mock('../../db/repositories/user.repository', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

describe('Auth Middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.onError(errorHandler);
    vi.clearAllMocks();
  });

  describe('authMiddleware', () => {
    it('should allow request with valid token', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');

      vi.mocked(verifyAccessToken).mockResolvedValue({
        userId: '123',
        tenantId: '456',
        email: 'test@example.com',
      });
      vi.mocked(userRepository.findById).mockResolvedValue({
        id: '123',
        tenantId: '456',
        email: 'test@example.com',
        displayName: null,
        avatarUrl: null,
        isActive: true,
      } as any);

      app.use('/*', authMiddleware());
      app.get('/test', (c) => c.json({ userId: c.get('user').id }));

      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.userId).toBe('123');
    });

    it('should reject request without token', async () => {
      app.use('/*', authMiddleware());
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      vi.mocked(verifyAccessToken).mockRejectedValue(new Error('Invalid token'));

      app.use('/*', authMiddleware());
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer invalid_token' },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('optionalAuthMiddleware', () => {
    it('should allow request without token', async () => {
      app.use('/*', optionalAuthMiddleware());
      app.get('/test', (c) => {
        const user = c.get('user');
        return c.json({ hasUser: !!user });
      });

      const res = await app.request('/test');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.hasUser).toBe(false);
    });

    it('should set user if valid token provided', async () => {
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');

      vi.mocked(verifyAccessToken).mockResolvedValue({
        userId: '123',
        tenantId: '456',
        email: 'test@example.com',
      });
      vi.mocked(userRepository.findById).mockResolvedValue({
        id: '123',
        tenantId: '456',
        email: 'test@example.com',
        displayName: null,
        avatarUrl: null,
        isActive: true,
      } as any);

      app.use('/*', optionalAuthMiddleware());
      app.get('/test', (c) => {
        const user = c.get('user');
        return c.json({ hasUser: !!user, userId: user?.id });
      });

      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.hasUser).toBe(true);
      expect(data.userId).toBe('123');
    });
  });
});
