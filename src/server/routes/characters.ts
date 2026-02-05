/**
 * 角色路由
 *
 * 提供角色 CRUD、发布/下架和 Fork 功能的 API 端点
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { characterService } from '../services/character.service';
import { searchService } from '../services/search.service';
import { ratingService } from '../services/rating.service';
import { cacheService } from '../services/cache.service';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { requireFeature } from '../middleware/feature-gate';
import {
  createCharacterSchema,
  updateCharacterSchema,
} from '../../types/character';
import { searchCharactersSchema } from '../../types/search';
import { paginationSchema } from '../../types/api';
import { ratingInputSchema } from '../../types/rating';
import type { ApiResponse, PaginatedResponse } from '../../types/api';
import type { Character } from '../../db/schema/characters';
import type { RatingResponseDto } from '../../types/rating';

export const characterRoutes = new Hono();

// 创建角色
characterRoutes.post(
  '/',
  authMiddleware(),
  zValidator('json', createCharacterSchema),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');
    const character = await characterService.create(user.id, user.tenantId, input);

    // Invalidate relevant caches
    await cacheService.invalidateCharacter(character.id);

    return c.json<ApiResponse>(
      {
        success: true,
        data: character,
        meta: { timestamp: new Date().toISOString() },
      },
      201
    );
  }
);

// 获取用户的角色列表
characterRoutes.get(
  '/',
  authMiddleware(),
  zValidator('query', paginationSchema),
  async (c) => {
    const user = c.get('user');
    const pagination = c.req.valid('query');
    const result = await characterService.getByTenantId(user.tenantId, pagination);

    return c.json<ApiResponse<PaginatedResponse<Character>>>(
      {
        success: true,
        data: result,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// 获取角色统计 - 必须在 /:id 之前
characterRoutes.get('/stats', authMiddleware(), async (c) => {
  const user = c.get('user');
  const result = await characterService.getByTenantId(user.tenantId, { page: 1, limit: 1000 });

  return c.json<ApiResponse>(
    {
      success: true,
      data: {
        total: result.pagination.total,
        favorites: 0, // TODO: implement favorites
      },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 浏览市场（公开角色）- 必须在 /:id 之前
characterRoutes.get(
  '/marketplace',
  optionalAuthMiddleware(),
  zValidator('query', paginationSchema),
  async (c) => {
    const pagination = c.req.valid('query');
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;

    // Try to get from cache first
    const cached = await cacheService.getCachedMarketplace<PaginatedResponse<Character>>(page, limit);
    if (cached) {
      c.header('X-Cache', 'HIT');
      return c.json<ApiResponse<PaginatedResponse<Character>>>(
        {
          success: true,
          data: cached,
          meta: { timestamp: new Date().toISOString() },
        },
        200
      );
    }

    const result = await characterService.getPublicCharacters(pagination);

    // Cache the result
    await cacheService.setCachedMarketplace(page, limit, result);

    c.header('X-Cache', 'MISS');
    return c.json<ApiResponse<PaginatedResponse<Character>>>(
      {
        success: true,
        data: result,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// 搜索角色 - 必须在 /:id 之前
characterRoutes.get(
  '/search',
  optionalAuthMiddleware(),
  zValidator('query', searchCharactersSchema),
  async (c) => {
    try {
      const query = c.req.valid('query');
      const user = c.get('user');

      // 解析标签（逗号分隔）
      const tags = query.tags ? query.tags.split(',').map((t) => t.trim()) : undefined;

      // Try to get from cache first
      const cached = await cacheService.getCachedSearch(
        query.q,
        query.sort,
        query.category,
        tags,
        query.page,
        query.limit
      );
      if (cached) {
        c.header('X-Cache', 'HIT');
        return c.json<ApiResponse>(
          {
            success: true,
            data: cached,
            meta: { timestamp: new Date().toISOString() },
          },
          200
        );
      }

      // 执行搜索
      const result = await searchService.searchCharacters({
        query: query.q,
        sort: query.sort,
        filter: query.filter,
        category: query.category,
        tags,
        isNsfw: query.isNsfw,
        userId: user?.id,
        page: query.page,
        limit: query.limit,
      });

      // Cache the result
      await cacheService.setCachedSearch(
        query.q,
        query.sort,
        query.category,
        tags,
        query.page,
        query.limit,
        result
      );

      c.header('X-Cache', 'MISS');
      return c.json<ApiResponse>(
        {
          success: true,
          data: result,
          meta: { timestamp: new Date().toISOString() },
        },
        200
      );
    } catch (error) {
      console.error('Search error:', error);
      return c.json<ApiResponse>(
        {
          success: false,
          error: {
            code: 'SEARCH_ERROR',
            message: 'Failed to search characters',
          },
          meta: { timestamp: new Date().toISOString() },
        },
        500
      );
    }
  }
);

// 获取单个角色
characterRoutes.get('/:id', authMiddleware(), async (c) => {
  const characterId = c.req.param('id');

  // Try to get from cache first
  const cached = await cacheService.getCachedCharacter<Character>(characterId);
  if (cached) {
    c.header('X-Cache', 'HIT');
    return c.json<ApiResponse>(
      {
        success: true,
        data: cached,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }

  const character = await characterService.getById(characterId);

  // Cache the result
  await cacheService.setCachedCharacter(characterId, character);

  c.header('X-Cache', 'MISS');
  return c.json<ApiResponse>(
    {
      success: true,
      data: character,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 更新角色
characterRoutes.patch(
  '/:id',
  authMiddleware(),
  zValidator('json', updateCharacterSchema),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('id');
    const input = c.req.valid('json');
    const character = await characterService.update(characterId, user.id, user.tenantId, input);

    // Invalidate relevant caches
    await cacheService.invalidateCharacter(characterId);

    return c.json<ApiResponse>(
      {
        success: true,
        data: character,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// 删除角色
characterRoutes.delete('/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('id');
  await characterService.delete(characterId, user.id, user.tenantId);

  // Invalidate relevant caches
  await cacheService.invalidateCharacter(characterId);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { message: 'Character deleted successfully' },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 发布角色到市场
characterRoutes.post(
  '/:id/publish',
  authMiddleware(),
  requireFeature('character_share'),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('id');
    const character = await characterService.publish(characterId, user.id, user.tenantId);

    // Invalidate relevant caches
    await cacheService.invalidateCharacter(characterId);

    return c.json<ApiResponse>(
      {
        success: true,
        data: character,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// 从市场下架角色
characterRoutes.post(
  '/:id/unpublish',
  authMiddleware(),
  requireFeature('character_share'),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('id');
    const character = await characterService.unpublish(characterId, user.id, user.tenantId);

    // Invalidate relevant caches
    await cacheService.invalidateCharacter(characterId);

    return c.json<ApiResponse>(
      {
        success: true,
        data: character,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// Fork 公开角色
characterRoutes.post('/:id/fork', authMiddleware(), async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('id');
  const character = await characterService.fork(characterId, user.id, user.tenantId);

  // Invalidate marketplace cache as it affects download count
  await cacheService.invalidateMarketplace();

  return c.json<ApiResponse>(
    {
      success: true,
      data: character,
      meta: { timestamp: new Date().toISOString() },
    },
    201
  );
});

// 提交评分
characterRoutes.post(
  '/:id/ratings',
  authMiddleware(),
  zValidator('json', ratingInputSchema),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('id');
    const input = c.req.valid('json');

    await ratingService.submitRating(characterId, user.id, input);

    // Invalidate character cache as ratings change
    await cacheService.invalidateCharacter(characterId);

    return c.json<ApiResponse>(
      {
        success: true,
        data: { message: 'Rating submitted successfully' },
        meta: { timestamp: new Date().toISOString() },
      },
      201
    );
  }
);

// 获取评分详情
characterRoutes.get('/:id/ratings', optionalAuthMiddleware(), async (c) => {
  const characterId = c.req.param('id');
  const user = c.get('user');
  const ratings = await ratingService.getRatings(characterId, user?.id);

  return c.json<ApiResponse<RatingResponseDto>>(
    {
      success: true,
      data: ratings,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 更新评分
characterRoutes.put(
  '/:id/ratings',
  authMiddleware(),
  zValidator('json', ratingInputSchema),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('id');
    const input = c.req.valid('json');

    await ratingService.updateRating(characterId, user.id, input);

    // Invalidate character cache as ratings change
    await cacheService.invalidateCharacter(characterId);

    return c.json<ApiResponse>(
      {
        success: true,
        data: { message: 'Rating updated successfully' },
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// 删除评分
characterRoutes.delete('/:id/ratings', authMiddleware(), async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('id');

  await ratingService.deleteRating(characterId, user.id);

  // Invalidate character cache as ratings change
  await cacheService.invalidateCharacter(characterId);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { message: 'Rating deleted successfully' },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

