/**
 * Social Follow Routes
 *
 * 关注 / 取关 / 粉丝列表。属于 social_follow 模块（P2-1），默认关闭，
 * 仅在该模块开启时由 server/index.ts 挂载到 /api/v1/social。
 * 收藏与评论仍在 social.ts，始终可用。
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { followUserSchema } from '../../types/social';
import { socialService } from '../services/social.service';
import { cacheService } from '../services/cache.service';
import type { ApiResponse } from '../../types/api';

export const socialFollowRoutes = new Hono();

const socialPaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// =====================
// Follow Routes
// =====================

// POST /follows - Follow a user
socialFollowRoutes.post(
  '/follows',
  authMiddleware(),
  zValidator('json', followUserSchema),
  async (c) => {
    const user = c.get('user');
    const { followingId } = c.req.valid('json');
    const follow = await socialService.followUser(user.id, followingId);

    await cacheService.deletePattern(`social:*:${user.id}:*`);

    return c.json<ApiResponse>(
      {
        success: true,
        data: follow,
        meta: { timestamp: new Date().toISOString() },
      },
      201
    );
  }
);

// DELETE /follows/:userId - Unfollow a user
socialFollowRoutes.delete('/follows/:userId', authMiddleware(), async (c) => {
  const user = c.get('user');
  const targetId = c.req.param('userId');
  await socialService.unfollowUser(user.id, targetId);

  await cacheService.deletePattern(`social:*:${user.id}:*`);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { unfollowed: true },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// GET /follows/:userId/status - Check follow status
socialFollowRoutes.get('/follows/:userId/status', authMiddleware(), async (c) => {
  const user = c.get('user');
  const targetId = c.req.param('userId');
  const status = await socialService.getFollowStatus(user.id, targetId);

  return c.json<ApiResponse>(
    {
      success: true,
      data: status,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// GET /users/:userId/followers - Get followers
socialFollowRoutes.get(
  '/users/:userId/followers',
  authMiddleware(),
  zValidator('query', socialPaginationSchema),
  async (c) => {
    const userId = c.req.param('userId');
    const { limit, offset } = c.req.valid('query');
    const page = Math.floor(offset / limit) + 1;

  const cacheKey = `social:followers:${userId}:${page}`;
  const cached = await cacheService.get(cacheKey);
  if (cached) {
    return c.json<ApiResponse>({
      success: true,
      data: cached,
      meta: { timestamp: new Date().toISOString(), cached: true },
    }, 200);
  }

  const followers = await socialService.getFollowers(userId, limit, offset);

  await cacheService.set(cacheKey, followers, 60);

  return c.json<ApiResponse>(
    {
      success: true,
      data: followers,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// GET /users/:userId/following - Get following
socialFollowRoutes.get(
  '/users/:userId/following',
  authMiddleware(),
  zValidator('query', socialPaginationSchema),
  async (c) => {
    const userId = c.req.param('userId');
    const { limit, offset } = c.req.valid('query');
    const page = Math.floor(offset / limit) + 1;

  const cacheKey = `social:following:${userId}:${page}`;
  const cached = await cacheService.get(cacheKey);
  if (cached) {
    return c.json<ApiResponse>({
      success: true,
      data: cached,
      meta: { timestamp: new Date().toISOString(), cached: true },
    }, 200);
  }

  const following = await socialService.getFollowing(userId, limit, offset);

  await cacheService.set(cacheKey, following, 60);

  return c.json<ApiResponse>(
    {
      success: true,
      data: following,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});
