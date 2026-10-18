/**
 * 用户路由
 *
 * 提供用户资料管理、密码修改和账户删除 API 端点
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { userService } from '../services/user.service';
import { authMiddleware } from '../middleware/auth';
import { nsfwPreferenceService } from '../services/nsfw-preference.service';
import { updateUserSchema, updatePasswordSchema, updatePreferencesSchema } from '../../types/user';
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

// 读取 NSFW 偏好（含平台开关与年龄确认状态，前端据此决定卡片怎么展示）
userRoutes.get('/me/preferences', authMiddleware(), async (c) => {
  const user = c.get('user');
  const data = await nsfwPreferenceService.getPreference(user.id);

  return c.json<ApiResponse>(
    { success: true, data, meta: { timestamp: new Date().toISOString() } },
    200
  );
});

// 修改 NSFW 偏好。打开需要平台开关开启且已确认年龄，否则 403
// （code: NSFW_DISABLED / AGE_CONFIRMATION_REQUIRED）；关闭永远允许
userRoutes.patch(
  '/me/preferences',
  authMiddleware(),
  zValidator('json', updatePreferencesSchema),
  async (c) => {
    const user = c.get('user');
    const { showNsfw } = c.req.valid('json');
    const data = await nsfwPreferenceService.setShowNsfw(user.id, showNsfw);

    return c.json<ApiResponse>(
      { success: true, data, meta: { timestamp: new Date().toISOString() } },
      200
    );
  }
);

// 补确认年满 18 岁（存量用户注册时没有收集）。幂等：已确认则原样返回，不覆盖证据。
// 返回值与 GET /me/preferences 同形；IP 取自请求头，与注册路由一致
userRoutes.post('/me/age-confirmation', authMiddleware(), async (c) => {
  const user = c.get('user');
  const actorIp =
    c.req.header('x-forwarded-for')?.split(',')[0] || c.req.header('x-real-ip') || undefined;
  const data = await nsfwPreferenceService.confirmAge(user.id, actorIp);

  return c.json<ApiResponse>(
    { success: true, data, meta: { timestamp: new Date().toISOString() } },
    200
  );
});

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
