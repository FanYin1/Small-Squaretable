/**
 * 认证路由
 *
 * 提供注册、登录、刷新令牌、登出等 API 端点
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authService } from '../services/auth.service';
import { authMiddleware } from '../middleware/auth';
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

    return c.json<ApiResponse>({
      success: true,
      data: result,
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
