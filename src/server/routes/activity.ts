import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { activityService } from '../services/activity.service';
import type { ApiResponse } from '../../types/api';

export const activityRoutes = new Hono();

const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /feed - Get activity feed (from followed users)
activityRoutes.get(
  '/feed',
  authMiddleware(),
  zValidator('query', feedQuerySchema),
  async (c) => {
    const user = c.get('user');
    const { limit, offset } = c.req.valid('query');
    const activities = await activityService.getFeed(user.id, limit, offset);

    return c.json<ApiResponse>({
      success: true,
      data: activities,
      meta: { timestamp: new Date().toISOString() },
    }, 200);
  }
);

// GET /users/:userId/activities - Get user's activity history
activityRoutes.get(
  '/users/:userId/activities',
  authMiddleware(),
  zValidator('query', feedQuerySchema),
  async (c) => {
    const userId = c.req.param('userId');
    const { limit, offset } = c.req.valid('query');
    const activities = await activityService.getUserActivities(userId, limit, offset);

    return c.json<ApiResponse>({
      success: true,
      data: activities,
      meta: { timestamp: new Date().toISOString() },
    }, 200);
  }
);
