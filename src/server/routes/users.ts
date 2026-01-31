/**
 * 用户路由
 *
 * 提供用户资料管理、密码修改和账户删除 API 端点
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { userService } from '../services/user.service';
import { authMiddleware } from '../middleware/auth';
import { updateUserSchema, updatePasswordSchema } from '../../types/user';
import type { ApiResponse } from '../../types/api';

export const userRoutes = new Hono();

// 获取当前用户信息
userRoutes.get('/me', authMiddleware(), async (c) => {
  const user = c.get('user');
  const fullUser = await userService.getProfile(user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: fullUser,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 更新当前用户信息
userRoutes.patch(
  '/me',
  authMiddleware(),
  zValidator('json', updateUserSchema),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');
    const updatedUser = await userService.updateProfile(user.id, input);

    return c.json<ApiResponse>(
      {
        success: true,
        data: updatedUser,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// 修改密码
userRoutes.patch(
  '/me/password',
  authMiddleware(),
  zValidator('json', updatePasswordSchema),
  async (c) => {
    const user = c.get('user');
    const { currentPassword, newPassword } = c.req.valid('json');
    await userService.updatePassword(user.id, currentPassword, newPassword);

    return c.json<ApiResponse>(
      {
        success: true,
        data: { message: 'Password updated successfully' },
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// 删除账户
userRoutes.delete('/me', authMiddleware(), async (c) => {
  const user = c.get('user');
  await userService.deleteAccount(user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { message: 'Account deleted successfully' },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});
