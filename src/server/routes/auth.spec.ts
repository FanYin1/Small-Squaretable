import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { authRoutes } from './auth';

vi.mock('../services/auth.service', () => ({
  authService: {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
  },
}));

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

describe('Auth Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/auth', authRoutes);
    vi.clearAllMocks();
  });

  describe('POST /register', () => {
    it('should register a new user', async () => {
      const { authService } = await import('../services/auth.service');
      vi.mocked(authService.register).mockResolvedValue({
        user: { id: '123', email: 'test@example.com', tenantId: '456', displayName: null, avatarUrl: null },
        tokens: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 },
      });

      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.user.email).toBe('test@example.com');
    });

    it('should return 400 for invalid input', async () => {
      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'invalid', password: '123' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /login', () => {
    it('should login with valid credentials', async () => {
      const { authService } = await import('../services/auth.service');
      vi.mocked(authService.login).mockResolvedValue({
        user: { id: '123', email: 'test@example.com', tenantId: '456', displayName: null, avatarUrl: null },
        tokens: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 },
      });

      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('POST /refresh', () => {
    it('should refresh tokens', async () => {
      const { authService } = await import('../services/auth.service');
      vi.mocked(authService.refresh).mockResolvedValue({
        accessToken: 'new_access',
        refreshToken: 'new_refresh',
        expiresIn: 900,
      });

      const res = await app.request('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'old_refresh' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.accessToken).toBe('new_access');
    });
  });

  describe('POST /logout', () => {
    it('should logout successfully', async () => {
      const { authService } = await import('../services/auth.service');
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
      vi.mocked(authService.logout).mockResolvedValue(undefined);

      const res = await app.request('/api/v1/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});
