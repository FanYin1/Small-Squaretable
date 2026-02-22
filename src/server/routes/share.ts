/**
 * Public share routes
 *
 * Provides unauthenticated access to shared characters and chat snapshots.
 */

import { Hono } from 'hono';
import { db } from '../../db';
import { eq, sql } from 'drizzle-orm';
import { characters } from '../../db/schema/characters';
import { chatSnapshots } from '../../db/schema/chat-snapshots';
import { createLogger } from '../services/logger.service';
import type { ApiResponse } from '../../types/api';

const logger = createLogger({ service: 'share-route' });

export const shareRoutes = new Hono();

// GET /character/:token — Public character access via share token
shareRoutes.get('/character/:token', async (c) => {
  const token = c.req.param('token');

  try {
    const result = await db
      .select()
      .from(characters)
      .where(eq(characters.shareToken, token));

    const character = result[0];
    if (!character) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Shared character not found' },
          meta: { timestamp: new Date().toISOString() },
        },
        404,
      );
    }

    // Increment view count
    await db
      .update(characters)
      .set({ viewCount: sql`${characters.viewCount} + 1` })
      .where(eq(characters.id, character.id));

    return c.json<ApiResponse>(
      {
        success: true,
        data: {
          name: character.name,
          description: character.description,
          avatarUrl: character.avatarUrl,
          tags: character.tags,
          category: character.category,
          cardData: character.cardData,
          creatorId: character.creatorId,
          createdAt: character.createdAt,
        },
        meta: { timestamp: new Date().toISOString() },
      },
      200,
    );
  } catch (error) {
    logger.error('Failed to get shared character', { error: String(error), token });
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get shared character' },
        meta: { timestamp: new Date().toISOString() },
      },
      500,
    );
  }
});

// GET /snapshot/:token — Public snapshot access
shareRoutes.get('/snapshot/:token', async (c) => {
  const token = c.req.param('token');

  try {
    const result = await db
      .select()
      .from(chatSnapshots)
      .where(eq(chatSnapshots.shareToken, token));

    const snapshot = result[0];
    if (!snapshot) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Snapshot not found' },
          meta: { timestamp: new Date().toISOString() },
        },
        404,
      );
    }

    // Check expiration
    if (snapshot.expiresAt && new Date(snapshot.expiresAt) < new Date()) {
      return c.json(
        { error: 'Snapshot has expired' },
        410,
      );
    }

    return c.json<ApiResponse>(
      {
        success: true,
        data: snapshot,
        meta: { timestamp: new Date().toISOString() },
      },
      200,
    );
  } catch (error) {
    logger.error('Failed to get shared snapshot', { error: String(error), token });
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get shared snapshot' },
        meta: { timestamp: new Date().toISOString() },
      },
      500,
    );
  }
});
