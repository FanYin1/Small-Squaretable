import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { Hono } from 'hono';
import { authRoutes } from './auth';

vi.mock('../services/auth.service', () => ({
  authService: {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
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
    findByEmail: vi.fn(),
    findByVerificationToken: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../core/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../core/redis', () => ({
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue('token123'),
    del: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../services/sentry.service', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock('../middleware/request-id', () => ({
  getLogger: vi.fn().mockReturnValue(null),
  getRequestId: vi.fn().mockReturnValue('test-req-id'),
}));

import { BadRequestError } from '../../core/errors';
import { errorHandler } from '../middleware/error-handler';

function mockAuthUser() {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'test@example.com',
    displayName: 'Test User',
    avatarUrl: null,
    isActive: true,
    role: 'user',
  };
}

describe('Auth Email Verification Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.onError(errorHandler);
    app.route('/api/v1/auth', authRoutes);
    vi.clearAllMocks();
  });

  describe('GET /verify-email', () => {
    it('should verify email with valid token', async () => {
      const { authService } = await import('../services/auth.service');
      vi.mocked(authService.verifyEmail).mockResolvedValue(undefined);

      const res = await app.request('/api/v1/auth/verify-email?token=valid-token-hex', {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.message).toBe('Email verified successfully.');
      expect(authService.verifyEmail).toHaveBeenCalledWith('valid-token-hex');
    });

    it('should return 400 for invalid token', async () => {
      const { authService } = await import('../services/auth.service');
      vi.mocked(authService.verifyEmail).mockRejectedValue(
        new BadRequestError('Invalid or expired verification token'),
      );

      const res = await app.request('/api/v1/auth/verify-email?token=bad-token', {
        method: 'GET',
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when token query param is missing', async () => {
      const res = await app.request('/api/v1/auth/verify-email', {
        method: 'GET',
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /resend-verification', () => {
    it('should resend verification email for authenticated user', async () => {
      const { authService } = await import('../services/auth.service');
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');

      const user = mockAuthUser();
      vi.mocked(verifyAccessToken).mockResolvedValue({
        userId: user.id,
        tenantId: user.tenantId,
        email: user.email,
      });
      vi.mocked(userRepository.findById).mockResolvedValue(user as any);
      vi.mocked(authService.resendVerification).mockResolvedValue(undefined);

      const res = await app.request('/api/v1/auth/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.message).toBe('Verification email sent.');
      expect(authService.resendVerification).toHaveBeenCalledWith(user.id);
    });

    it('should return 401 without auth token', async () => {
      const res = await app.request('/api/v1/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(res.status).toBe(401);
    });

    it('should return 400 if email is already verified', async () => {
      const { authService } = await import('../services/auth.service');
      const { verifyAccessToken } = await import('../../core/jwt');
      const { userRepository } = await import('../../db/repositories/user.repository');

      const user = mockAuthUser();
      vi.mocked(verifyAccessToken).mockResolvedValue({
        userId: user.id,
        tenantId: user.tenantId,
        email: user.email,
      });
      vi.mocked(userRepository.findById).mockResolvedValue(user as any);
      vi.mocked(authService.resendVerification).mockRejectedValue(
        new BadRequestError('Email is already verified'),
      );

      const res = await app.request('/api/v1/auth/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('Register sends verification email', () => {
    it('should call register which triggers verification email', async () => {
      const { authService } = await import('../services/auth.service');
      vi.mocked(authService.register).mockResolvedValue({
        user: {
          id: 'user-1',
          email: 'new@example.com',
          tenantId: 'tenant-1',
          displayName: null,
          avatarUrl: null,
          role: 'user',
        },
        tokens: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 },
      });

      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'new@example.com', password: 'password123' }),
      });

      expect(res.status).toBe(201);
      expect(authService.register).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'password123',
      });
    });
  });
});
