/**
 * Character Collaborator Routes
 *
 * Manage collaborators on characters (invite, list, update role, remove).
 * All endpoints require authentication and the team_collaboration feature.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db';
import { characters } from '../../db/schema/characters';
import { characterCollaborators } from '../../db/schema/character-collaborators';
import { users } from '../../db/schema/users';
import { authMiddleware } from '../middleware/auth';
import { requireFeature } from '../middleware/feature-gate';
import { createLogger } from '../services/logger.service';
import type { ApiResponse } from '../../types/api';

const logger = createLogger({ service: 'character-collaborators' });

export const characterCollaboratorRoutes = new Hono();

const collaboratorRoleSchema = z.object({
  role: z.enum(['editor', 'viewer']),
});

const inviteCollaboratorSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['editor', 'viewer']),
});

// POST /characters/:id/collaborators — Invite a collaborator
characterCollaboratorRoutes.post(
  '/characters/:id/collaborators',
  authMiddleware(),
  requireFeature('team_collaboration'),
  zValidator('json', inviteCollaboratorSchema),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('id');
    const body = c.req.valid('json');

    try {
      // Verify requesting user is the character owner
      const [character] = await db
        .select({ creatorId: characters.creatorId })
        .from(characters)
        .where(eq(characters.id, characterId))
        .limit(1);

      if (!character) {
        return c.json<ApiResponse>(
          { success: false, error: { code: 'NOT_FOUND', message: 'Character not found' }, meta: { timestamp: new Date().toISOString() } },
          404,
        );
      }

      if (character.creatorId !== user.id) {
        return c.json<ApiResponse>(
          { success: false, error: { code: 'FORBIDDEN', message: 'Only the character owner can invite collaborators' }, meta: { timestamp: new Date().toISOString() } },
          403,
        );
      }

      const [collaborator] = await db
        .insert(characterCollaborators)
        .values({
          characterId,
          userId: body.userId,
          role: body.role,
          invitedBy: user.id,
        })
        .returning();

      logger.info('Collaborator invited', { characterId, userId: body.userId, role: body.role });

      return c.json<ApiResponse>(
        { success: true, data: collaborator, meta: { timestamp: new Date().toISOString() } },
        201,
      );
    } catch (error: any) {
      // Handle unique constraint violation
      if (error?.code === '23505') {
        return c.json<ApiResponse>(
          { success: false, error: { code: 'CONFLICT', message: 'User is already a collaborator on this character' }, meta: { timestamp: new Date().toISOString() } },
          409,
        );
      }
      logger.error('Failed to invite collaborator', { error: String(error), characterId });
      return c.json<ApiResponse>(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to invite collaborator' }, meta: { timestamp: new Date().toISOString() } },
        500,
      );
    }
  },
);

// GET /characters/:id/collaborators — List collaborators
characterCollaboratorRoutes.get(
  '/characters/:id/collaborators',
  authMiddleware(),
  requireFeature('team_collaboration'),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('id');

    try {
      // Verify the requesting user is the owner or a collaborator
      const [character] = await db
        .select({ creatorId: characters.creatorId })
        .from(characters)
        .where(eq(characters.id, characterId))
        .limit(1);

      if (!character) {
        return c.json<ApiResponse>(
          { success: false, error: { code: 'NOT_FOUND', message: 'Character not found' }, meta: { timestamp: new Date().toISOString() } },
          404,
        );
      }

      const isOwner = character.creatorId === user.id;

      if (!isOwner) {
        const [selfCollab] = await db
          .select({ id: characterCollaborators.id })
          .from(characterCollaborators)
          .where(and(
            eq(characterCollaborators.characterId, characterId),
            eq(characterCollaborators.userId, user.id),
          ))
          .limit(1);

        if (!selfCollab) {
          return c.json<ApiResponse>(
            { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' }, meta: { timestamp: new Date().toISOString() } },
            403,
          );
        }
      }

      // Query collaborators with user info
      const collaborators = await db
        .select({
          id: characterCollaborators.id,
          characterId: characterCollaborators.characterId,
          userId: characterCollaborators.userId,
          role: characterCollaborators.role,
          invitedBy: characterCollaborators.invitedBy,
          createdAt: characterCollaborators.createdAt,
          userName: users.displayName,
          userAvatar: users.avatarUrl,
        })
        .from(characterCollaborators)
        .innerJoin(users, eq(characterCollaborators.userId, users.id))
        .where(eq(characterCollaborators.characterId, characterId));

      return c.json<ApiResponse>(
        { success: true, data: collaborators, meta: { timestamp: new Date().toISOString() } },
        200,
      );
    } catch (error) {
      logger.error('Failed to list collaborators', { error: String(error), characterId });
      return c.json<ApiResponse>(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list collaborators' }, meta: { timestamp: new Date().toISOString() } },
        500,
      );
    }
  },
);

// PATCH /characters/:id/collaborators/:userId — Update collaborator role
characterCollaboratorRoutes.patch(
  '/characters/:id/collaborators/:userId',
  authMiddleware(),
  requireFeature('team_collaboration'),
  zValidator('json', collaboratorRoleSchema),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('id');
    const targetUserId = c.req.param('userId');
    const body = c.req.valid('json');

    try {
      // Owner only
      const [character] = await db
        .select({ creatorId: characters.creatorId })
        .from(characters)
        .where(eq(characters.id, characterId))
        .limit(1);

      if (!character) {
        return c.json<ApiResponse>(
          { success: false, error: { code: 'NOT_FOUND', message: 'Character not found' }, meta: { timestamp: new Date().toISOString() } },
          404,
        );
      }

      if (character.creatorId !== user.id) {
        return c.json<ApiResponse>(
          { success: false, error: { code: 'FORBIDDEN', message: 'Only the character owner can update collaborator roles' }, meta: { timestamp: new Date().toISOString() } },
          403,
        );
      }

      const [updated] = await db
        .update(characterCollaborators)
        .set({ role: body.role })
        .where(and(
          eq(characterCollaborators.characterId, characterId),
          eq(characterCollaborators.userId, targetUserId),
        ))
        .returning();

      if (!updated) {
        return c.json<ApiResponse>(
          { success: false, error: { code: 'NOT_FOUND', message: 'Collaborator not found' }, meta: { timestamp: new Date().toISOString() } },
          404,
        );
      }

      logger.info('Collaborator role updated', { characterId, userId: targetUserId, role: body.role });

      return c.json<ApiResponse>(
        { success: true, data: updated, meta: { timestamp: new Date().toISOString() } },
        200,
      );
    } catch (error) {
      logger.error('Failed to update collaborator role', { error: String(error), characterId });
      return c.json<ApiResponse>(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update collaborator role' }, meta: { timestamp: new Date().toISOString() } },
        500,
      );
    }
  },
);

// DELETE /characters/:id/collaborators/:userId — Remove collaborator
characterCollaboratorRoutes.delete(
  '/characters/:id/collaborators/:userId',
  authMiddleware(),
  requireFeature('team_collaboration'),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('id');
    const targetUserId = c.req.param('userId');

    try {
      // Owner can remove anyone; collaborator can remove themselves
      const [character] = await db
        .select({ creatorId: characters.creatorId })
        .from(characters)
        .where(eq(characters.id, characterId))
        .limit(1);

      if (!character) {
        return c.json<ApiResponse>(
          { success: false, error: { code: 'NOT_FOUND', message: 'Character not found' }, meta: { timestamp: new Date().toISOString() } },
          404,
        );
      }

      const isOwner = character.creatorId === user.id;
      const isSelf = user.id === targetUserId;

      if (!isOwner && !isSelf) {
        return c.json<ApiResponse>(
          { success: false, error: { code: 'FORBIDDEN', message: 'Only the owner or the collaborator themselves can remove a collaborator' }, meta: { timestamp: new Date().toISOString() } },
          403,
        );
      }

      const [deleted] = await db
        .delete(characterCollaborators)
        .where(and(
          eq(characterCollaborators.characterId, characterId),
          eq(characterCollaborators.userId, targetUserId),
        ))
        .returning();

      if (!deleted) {
        return c.json<ApiResponse>(
          { success: false, error: { code: 'NOT_FOUND', message: 'Collaborator not found' }, meta: { timestamp: new Date().toISOString() } },
          404,
        );
      }

      logger.info('Collaborator removed', { characterId, userId: targetUserId, removedBy: user.id });

      return c.json<ApiResponse>(
        { success: true, data: { message: 'Collaborator removed successfully' }, meta: { timestamp: new Date().toISOString() } },
        200,
      );
    } catch (error) {
      logger.error('Failed to remove collaborator', { error: String(error), characterId });
      return c.json<ApiResponse>(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to remove collaborator' }, meta: { timestamp: new Date().toISOString() } },
        500,
      );
    }
  },
);
