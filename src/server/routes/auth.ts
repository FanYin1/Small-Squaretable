/**
 * 认证路由
 *
 * 提供注册、登录、刷新令牌、登出等 API 端点
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authService } from '../services/auth.service';
import { authMiddleware } from '../middleware/auth';
import { passwordResetRateLimit, emailVerificationRateLimit } from '../middleware/rateLimit';
import { registerSchema, loginSchema, refreshTokenSchema } from '../../types/auth';
import type { ApiResponse } from '../../types/api';

export const authRoutes = new Hono();

authRoutes.post(
  '/register',
  zValidator('json', registerSchema),
  async (c) => {
    const input = c.req.valid('json');
    const result = await authService.register(input);

    return c.json<ApiResponse>(
      {
        success: true,
        data: result,
        meta: { timestamp: new Date().toISOString() },
      },
      201
    );
  }
);

authRoutes.post(
  '/login',
  zValidator('json', loginSchema),
  async (c) => {
    const input = c.req.valid('json');
    const result = await authService.login(input);

    if (result.requiresMfa) {
      return c.json<ApiResponse>({
        success: true,
        data: { requiresMfa: true, mfaToken: result.mfaToken },
        meta: { timestamp: new Date().toISOString() },
      });
    }

    return c.json<ApiResponse>({
      success: true,
      data: { user: result.user, tokens: result.tokens },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

authRoutes.post(
  '/refresh',
  zValidator('json', refreshTokenSchema),
  async (c) => {
    const { refreshToken } = c.req.valid('json');
    const tokens = await authService.refresh(refreshToken);

    return c.json<ApiResponse>({
      success: true,
      data: tokens,
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

authRoutes.post('/logout', authMiddleware(), async (c) => {
  const user = c.get('user');
  await authService.logout(user.id);

  return c.json<ApiResponse>({
    success: true,
    data: { message: 'Logged out successfully' },
    meta: { timestamp: new Date().toISOString() },
  });
});

authRoutes.get('/me', authMiddleware(), async (c) => {
  const user = c.get('user');

  return c.json<ApiResponse>({
    success: true,
    data: { user },
    meta: { timestamp: new Date().toISOString() },
  });
});

// Forgot password — always returns 200 to prevent email enumeration
const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

authRoutes.post(
  '/forgot-password',
  passwordResetRateLimit,
  zValidator('json', forgotPasswordSchema),
  async (c) => {
    const { email } = c.req.valid('json');
    await authService.forgotPassword(email);

    return c.json<ApiResponse>({
      success: true,
      data: { message: 'If that email is registered, a reset link has been sent.' },
      meta: { timestamp: new Date().toISOString() },
    });
  },
);

// Reset password with token
const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

authRoutes.post(
  '/reset-password',
  zValidator('json', resetPasswordSchema),
  async (c) => {
    const { token, password } = c.req.valid('json');
    await authService.resetPassword(token, password);

    return c.json<ApiResponse>({
      success: true,
      data: { message: 'Password has been reset successfully.' },
      meta: { timestamp: new Date().toISOString() },
    });
  },
);

// Verify email with token (public)
const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

authRoutes.get(
  '/verify-email',
  zValidator('query', verifyEmailSchema),
  async (c) => {
    const { token } = c.req.valid('query');
    await authService.verifyEmail(token);

    return c.json<ApiResponse>({
      success: true,
      data: { message: 'Email verified successfully.' },
      meta: { timestamp: new Date().toISOString() },
    });
  },
);

// Resend verification email (requires auth)
authRoutes.post(
  '/resend-verification',
  authMiddleware(),
  emailVerificationRateLimit,
  async (c) => {
    const user = c.get('user');
    await authService.resendVerification(user.id);

    return c.json<ApiResponse>({
      success: true,
      data: { message: 'Verification email sent.' },
      meta: { timestamp: new Date().toISOString() },
    });
  },
);
