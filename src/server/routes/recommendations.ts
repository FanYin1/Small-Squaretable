/**
 * Recommendation Routes
 *
 * API routes for personalized, trending, and similar character recommendations.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { recommendationService } from '../services/recommendation.service';
import { eventBus } from '../services/event-bus.service';
import type { ApiResponse } from '../../types/api';

export const recommendationRoutes = new Hono();

const limitSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// GET / — personalized recommendations (auth required)
recommendationRoutes.get(
  '/',
  authMiddleware(),
  zValidator('query', limitSchema),
  async (c) => {
    const user = c.get('user');
    const { limit } = c.req.valid('query');
    const items = await recommendationService.getPersonalized(user.id, limit);

    return c.json<ApiResponse>({
      success: true,
      data: { items },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

// GET /trending — public trending characters
recommendationRoutes.get(
  '/trending',
  optionalAuthMiddleware(),
  zValidator('query', limitSchema),
  async (c) => {
    const { limit } = c.req.valid('query');
    const items = await recommendationService.getTrending(limit);

    return c.json<ApiResponse>({
      success: true,
      data: { items },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

// GET /similar/:characterId — similar characters
recommendationRoutes.get(
  '/similar/:characterId',
  optionalAuthMiddleware(),
  zValidator('query', limitSchema),
  async (c) => {
    const characterId = c.req.param('characterId');
    const { limit } = c.req.valid('query');
    const items = await recommendationService.getSimilar(characterId, limit);

    return c.json<ApiResponse>({
      success: true,
      data: { items },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

// POST /feedback — track recommendation feedback (auth required)
const feedbackSchema = z.object({
  characterId: z.string().min(1),
  action: z.enum(['click', 'dismiss', 'bookmark', 'chat_start']),
  position: z.number().int().min(0).optional(),
  experimentId: z.string().optional(),
});

recommendationRoutes.post(
  '/feedback',
  authMiddleware(),
  zValidator('json', feedbackSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    await eventBus.emit('recommendation.feedback', {
      userId: user.id,
      characterId: body.characterId,
      action: body.action,
      position: body.position,
      experimentId: body.experimentId,
      timestamp: Date.now(),
    });

    return c.json<ApiResponse>({
      success: true,
      data: { received: true },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);
