/**
 * Character Growth API Routes
 *
 * Endpoints for querying character leveling, XP, and milestones.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { characterGrowthRepository } from '../../db/repositories/character-growth.repository';
import type { ApiResponse } from '../../types/api';

const characterQuerySchema = z.object({
  characterId: z.string().uuid(),
});

export const characterGrowthRouter = new Hono();

// Get growth data for a character (auto-creates record if missing)
characterGrowthRouter.get(
  '/',
  authMiddleware(),
  zValidator('query', characterQuerySchema),
  async (c) => {
    const user = c.get('user');
    const { characterId } = c.req.valid('query');

    const growth = await characterGrowthRepository.getOrCreate(characterId, user.id);

    return c.json<ApiResponse>({
      success: true,
      data: growth,
      meta: { timestamp: new Date().toISOString() },
    }, 200);
  }
);

// Get milestones for a character
characterGrowthRouter.get(
  '/milestones',
  authMiddleware(),
  zValidator('query', characterQuerySchema),
  async (c) => {
    const user = c.get('user');
    const { characterId } = c.req.valid('query');

    const growth = await characterGrowthRepository.getOrCreate(characterId, user.id);

    return c.json<ApiResponse>({
      success: true,
      data: growth.milestones,
      meta: { timestamp: new Date().toISOString() },
    }, 200);
  }
);
