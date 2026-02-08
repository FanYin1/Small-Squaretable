/**
 * Social Routes
 *
 * API routes for follows, favorites, and comments.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import {
  followUserSchema,
  favoriteCharacterSchema,
  createCommentSchema,
  updateCommentSchema,
  listCommentsQuerySchema,
} from '../../types/social';
import { socialService } from '../services/social.service';
import type { ApiResponse } from '../../types/api';

export const socialRoutes = new Hono();

// =====================
// Follow Routes
// =====================

// POST /follows - Follow a user
socialRoutes.post(
  '/follows',
  authMiddleware(),
  zValidator('json', followUserSchema),
  async (c) => {
    const user = c.get('user');
    const { followingId } = c.req.valid('json');
    const follow = await socialService.followUser(user.id, followingId);

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
socialRoutes.delete('/follows/:userId', authMiddleware(), async (c) => {
  const user = c.get('user');
  const targetId = c.req.param('userId');
  await socialService.unfollowUser(user.id, targetId);

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
socialRoutes.get('/follows/:userId/status', authMiddleware(), async (c) => {
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
socialRoutes.get('/users/:userId/followers', authMiddleware(), async (c) => {
  const userId = c.req.param('userId');
  const limit = Number(c.req.query('limit') || 20);
  const offset = Number(c.req.query('offset') || 0);
  const followers = await socialService.getFollowers(userId, limit, offset);

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
socialRoutes.get('/users/:userId/following', authMiddleware(), async (c) => {
  const userId = c.req.param('userId');
  const limit = Number(c.req.query('limit') || 20);
  const offset = Number(c.req.query('offset') || 0);
  const following = await socialService.getFollowing(userId, limit, offset);

  return c.json<ApiResponse>(
    {
      success: true,
      data: following,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// =====================
// Favorite Routes
// =====================

// POST /favorites - Favorite a character
socialRoutes.post(
  '/favorites',
  authMiddleware(),
  zValidator('json', favoriteCharacterSchema),
  async (c) => {
    const user = c.get('user');
    const { characterId } = c.req.valid('json');
    const favorite = await socialService.favoriteCharacter(user.id, characterId);

    return c.json<ApiResponse>(
      {
        success: true,
        data: favorite,
        meta: { timestamp: new Date().toISOString() },
      },
      201
    );
  }
);

// DELETE /favorites/:characterId - Unfavorite
socialRoutes.delete('/favorites/:characterId', authMiddleware(), async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('characterId');
  await socialService.unfavoriteCharacter(user.id, characterId);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { unfavorited: true },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// GET /favorites/:characterId/status - Check favorite status
socialRoutes.get('/favorites/:characterId/status', authMiddleware(), async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('characterId');
  const status = await socialService.getFavoriteStatus(user.id, characterId);

  return c.json<ApiResponse>(
    {
      success: true,
      data: status,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// GET /favorites - Get user's favorites
socialRoutes.get('/favorites', authMiddleware(), async (c) => {
  const user = c.get('user');
  const limit = Number(c.req.query('limit') || 20);
  const offset = Number(c.req.query('offset') || 0);
  const favorites = await socialService.getUserFavorites(user.id, limit, offset);

  return c.json<ApiResponse>(
    {
      success: true,
      data: favorites,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// =====================
// Comment Routes
// =====================

// POST /characters/:characterId/comments - Create comment
socialRoutes.post(
  '/characters/:characterId/comments',
  authMiddleware(),
  zValidator('json', createCommentSchema),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('characterId');
    const { content, parentId } = c.req.valid('json');
    const comment = await socialService.createComment(user.id, characterId, content, parentId);

    return c.json<ApiResponse>(
      {
        success: true,
        data: comment,
        meta: { timestamp: new Date().toISOString() },
      },
      201
    );
  }
);

// PATCH /comments/:commentId - Update comment
socialRoutes.patch(
  '/comments/:commentId',
  authMiddleware(),
  zValidator('json', updateCommentSchema),
  async (c) => {
    const user = c.get('user');
    const commentId = c.req.param('commentId');
    const { content } = c.req.valid('json');
    const comment = await socialService.updateComment(commentId, user.id, content);

    return c.json<ApiResponse>(
      {
        success: true,
        data: comment,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// DELETE /comments/:commentId - Delete comment
socialRoutes.delete('/comments/:commentId', authMiddleware(), async (c) => {
  const user = c.get('user');
  const commentId = c.req.param('commentId');
  await socialService.deleteComment(commentId, user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { deleted: true },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// GET /characters/:characterId/comments - List comments
socialRoutes.get(
  '/characters/:characterId/comments',
  authMiddleware(),
  zValidator('query', listCommentsQuerySchema),
  async (c) => {
    const characterId = c.req.param('characterId');
    const { limit, offset, sort } = c.req.valid('query');
    const comments = await socialService.getComments(characterId, limit, offset, sort);

    return c.json<ApiResponse>(
      {
        success: true,
        data: comments,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// GET /comments/:commentId/replies - Get replies
socialRoutes.get('/comments/:commentId/replies', authMiddleware(), async (c) => {
  const commentId = c.req.param('commentId');
  const limit = Number(c.req.query('limit') || 20);
  const offset = Number(c.req.query('offset') || 0);
  const replies = await socialService.getReplies(commentId, limit, offset);

  return c.json<ApiResponse>(
    {
      success: true,
      data: replies,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});
