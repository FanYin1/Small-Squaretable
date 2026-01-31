/**
 * 角色路由
 *
 * 提供角色 CRUD、发布/下架和 Fork 功能的 API 端点
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { characterService } from '../services/character.service';
import { searchService } from '../services/search.service';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import {
  createCharacterSchema,
  updateCharacterSchema,
} from '../../types/character';
import { searchCharactersSchema } from '../../types/search';
import { paginationSchema } from '../../types/api';
import type { ApiResponse, PaginatedResponse } from '../../types/api';
import type { Character } from '../../db/schema/characters';

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

// 获取单个角色
characterRoutes.get('/:id', authMiddleware(), async (c) => {
  const characterId = c.req.param('id');
  const character = await characterService.getById(characterId);

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
characterRoutes.post('/:id/publish', authMiddleware(), async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('id');
  const character = await characterService.publish(characterId, user.id, user.tenantId);

  return c.json<ApiResponse>(
    {
      success: true,
      data: character,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 从市场下架角色
characterRoutes.post('/:id/unpublish', authMiddleware(), async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('id');
  const character = await characterService.unpublish(characterId, user.id, user.tenantId);

  return c.json<ApiResponse>(
    {
      success: true,
      data: character,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 浏览市场（公开角色）
characterRoutes.get(
  '/marketplace',
  optionalAuthMiddleware(),
  zValidator('query', paginationSchema),
  async (c) => {
    const pagination = c.req.valid('query');
    const result = await characterService.getPublicCharacters(pagination);

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

// 搜索角色
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

// Fork 公开角色
characterRoutes.post('/:id/fork', authMiddleware(), async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('id');
  const character = await characterService.fork(characterId, user.id, user.tenantId);

  return c.json<ApiResponse>(
    {
      success: true,
      data: character,
      meta: { timestamp: new Date().toISOString() },
    },
    201
  );
});
