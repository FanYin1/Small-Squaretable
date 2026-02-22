/**
 * Character Relationships API Routes
 *
 * CRUD endpoints for managing relationships between characters.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { characterRelationshipRepository } from '../../db/repositories/character-relationship.repository';
import type { ApiResponse } from '../../types/api';

// --- Validation schemas ---

const relationshipTypeEnum = z.enum([
  'friend', 'rival', 'mentor', 'student', 'lover', 'family', 'acquaintance',
]);

const listQuerySchema = z.object({
  characterId: z.string().uuid(),
});

const createRelationshipSchema = z.object({
  characterId: z.string().uuid(),
  targetCharacterId: z.string().uuid().optional(),
  type: relationshipTypeEnum,
  affinity: z.number().min(0).max(1).default(0.5),
  label: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
});

const updateRelationshipSchema = z.object({
  type: relationshipTypeEnum.optional(),
  affinity: z.number().min(0).max(1).optional(),
  label: z.string().max(100).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
});

export const characterRelationshipsRouter = new Hono();

// List relationships for a character
characterRelationshipsRouter.get(
  '/',
  authMiddleware(),
  zValidator('query', listQuerySchema),
  async (c) => {
    const user = c.get('user');
    const { characterId } = c.req.valid('query');

    const relationships = await characterRelationshipRepository.findByCharacter(characterId, user.id);

    return c.json<ApiResponse>({
      success: true,
      data: relationships,
      meta: { timestamp: new Date().toISOString() },
    }, 200);
  }
);

// Create relationship
characterRelationshipsRouter.post(
  '/',
  authMiddleware(),
  zValidator('json', createRelationshipSchema),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');

    const relationship = await characterRelationshipRepository.create({
      userId: user.id,
      characterId: input.characterId,
      targetCharacterId: input.targetCharacterId,
      type: input.type,
      affinity: String(input.affinity),
      label: input.label,
      description: input.description,
    });

    return c.json<ApiResponse>({
      success: true,
      data: relationship,
      meta: { timestamp: new Date().toISOString() },
    }, 201);
  }
);

// Update relationship (ownership check via repository)
characterRelationshipsRouter.patch(
  '/:id',
  authMiddleware(),
  zValidator('json', updateRelationshipSchema),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const input = c.req.valid('json');

    const updateData: Record<string, unknown> = {};
    if (input.type !== undefined) updateData.type = input.type;
    if (input.affinity !== undefined) updateData.affinity = String(input.affinity);
    if (input.label !== undefined) updateData.label = input.label;
    if (input.description !== undefined) updateData.description = input.description;

    const updated = await characterRelationshipRepository.update(id, user.id, updateData as Parameters<typeof characterRelationshipRepository.update>[2]);
    if (!updated) {
      return c.json<ApiResponse>({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Relationship not found' },
        meta: { timestamp: new Date().toISOString() },
      }, 404);
    }

    return c.json<ApiResponse>({
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString() },
    }, 200);
  }
);

// Delete relationship (ownership check via repository)
characterRelationshipsRouter.delete('/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const deleted = await characterRelationshipRepository.delete(id, user.id);
  if (!deleted) {
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Relationship not found' },
      meta: { timestamp: new Date().toISOString() },
    }, 404);
  }

  return c.json<ApiResponse>({
    success: true,
    data: { message: 'Relationship deleted successfully' },
    meta: { timestamp: new Date().toISOString() },
  }, 200);
});
