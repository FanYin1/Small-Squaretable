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
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          ageConfirmed: true,
          inviteCode: 'ABCD-2345-WXYZ',
        }),
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

    it.each([
      ['缺少', {}],
      ['空串', { inviteCode: '' }],
      ['纯空白', { inviteCode: '   ' }],
      ['超长', { inviteCode: 'A'.repeat(65) }],
    ])('邀请码%s直接 400，服务层都不该被调用', async (_label, extra) => {
      const { authService } = await import('../services/auth.service');

      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          ageConfirmed: true,
          ...extra,
        }),
      });

      expect(res.status).toBe(400);
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('缺少成年声明直接 400，服务层都不该被调用', async () => {
      const { authService } = await import('../services/auth.service');

      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      });

      expect(res.status).toBe(400);
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('声明为 false 同样 400 —— 不能只检查字段存不存在', async () => {
      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          ageConfirmed: false,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('IP 从请求头取，客户端自己填的 IP 不作数', async () => {
      const { authService } = await import('../services/auth.service');
      vi.mocked(authService.register).mockResolvedValue({
        user: { id: '123', email: 'test@example.com', tenantId: '456', displayName: null, avatarUrl: null },
        tokens: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 },
      });

      await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '203.0.113.7, 10.0.0.1',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          ageConfirmed: true,
          inviteCode: 'ABCD-2345-WXYZ',
          actorIp: '1.2.3.4',
        }),
      });

      expect(authService.register).toHaveBeenCalledWith(
        expect.objectContaining({ actorIp: '203.0.113.7' })
      );
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
