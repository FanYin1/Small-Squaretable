/**
 * 角色路由
 *
 * 提供角色 CRUD、发布/下架和 Fork 功能的 API 端点
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { characterService } from '../services/character.service';
import { characterVersionService } from '../services/character-version.service';
import { logger } from '../services/logger.service';

const charLogger = logger.child({ module: 'characters' });
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
import { worldBookRepository } from '../../db/repositories/worldbook.repository';
import { worldBookEntryRepository } from '../../db/repositories/worldbook-entry.repository';
import { favoriteRepository } from '../../db/repositories/favorite.repository';
import { eventBus } from '../services/event-bus.service';

/**
 * Create a world book from a SillyTavern character_book embedded in card data.
 *
 * Maps the V2 character_book format to the internal world book schema and
 * creates all associated entries. Errors are caught and logged so that a
 * failure here never prevents the character from being created.
 */
async function createCharacterWorldBook(
  characterId: string,
  ownerId: string,
  characterName: string,
  characterBook: any
) {
  try {
    // Map position from SillyTavern format to internal format
    // Supports both string formats (V1) and numeric formats (V2: 0-6)
    const mapPosition = (pos: string | number | undefined): string => {
      switch (pos) {
        case 0:
        case 'before_char':
          return 'before';
        case 1:
        case 'after_char':
          return 'after';
        case 2:
          return 'ANTop';
        case 3:
          return 'ANBottom';
        case 4:
          return 'atDepth';
        case 5:
          return 'EMTop';
        case 6:
          return 'EMBottom';
        default:
          return 'after';
      }
    };

    // Map selective logic from SillyTavern numeric format to internal string format
    const mapSelectiveLogic = (entry: any): string => {
      if (entry.selective === false) {
        return 'AND_ANY';
      }
      switch (entry.selectiveLogic ?? entry.selective_logic) {
        case 0:
          return 'AND_ANY';
        case 1:
          return 'AND_ALL';
        case 2:
          return 'NOT_ANY';
        case 3:
          return 'NOT_ALL';
        default:
          return 'AND_ANY';
      }
    };

    // Create the world book
    const worldBook = await worldBookRepository.create({
      name: characterBook.name || `${characterName}'s Lorebook`,
      scope: 'character',
      ownerId,
      characterId,
      settings: {
        budget: 25,
        budgetCap: characterBook.token_budget ?? 0,
        recursive: characterBook.recursive_scanning ?? false,
        maxRecursionSteps: 0,
        caseSensitive: false,
        matchWholeWords: false,
        scanDepth: characterBook.scan_depth ?? 4,
      },
    });

    // Create entries
    const entries = Array.isArray(characterBook.entries) ? characterBook.entries : [];
    for (const entry of entries) {
      await worldBookEntryRepository.create({
        worldBookId: worldBook.id,
        keys: Array.isArray(entry.keys) ? entry.keys : [],
        keysSecondary: Array.isArray(entry.secondary_keys) ? entry.secondary_keys : [],
        selectiveLogic: mapSelectiveLogic(entry),
        content: entry.content ?? '',
        comment: entry.comment || entry.name || null,
        position: mapPosition(entry.position),
        depth: entry.depth ?? entry.extensions?.depth ?? 4,
        order: entry.insertion_order ?? 100,
        enabled: entry.enabled ?? true,
        constant: entry.constant ?? false,
        probability: entry.probability ?? 100,
        sticky: entry.sticky ?? 0,
        cooldown: entry.cooldown ?? 0,
        delay: entry.delay ?? 0,
        caseSensitive: entry.case_sensitive ?? false,
        matchWholeWords: entry.match_whole_words ?? false,
        preventRecursion: entry.prevent_recursion ?? false,
        excludeRecursion: entry.exclude_recursion ?? false,
      });
    }

    return worldBook;
  } catch (error) {
    charLogger.warn(
      `Failed to create world book for character ${characterId}`,
      { error: String(error) }
    );
    return null;
  }
}

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

    // Create world book from character_book if present
    const cardData = input.cardData as Record<string, any>;
    const characterBook = cardData?.character_book;
    if (
      characterBook &&
      Array.isArray(characterBook.entries) &&
      characterBook.entries.length > 0
    ) {
      await createCharacterWorldBook(
        character.id,
        user.id,
        character.name,
        characterBook
      );
    }


    eventBus.emit('character.created', { characterId: character.id, creatorId: user.id, name: character.name, isPublic: character.isPublic });

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
  const [result, favoritesCount] = await Promise.all([
    characterService.getByTenantId(user.tenantId, { page: 1, limit: 1000, sortOrder: 'desc' }),
    favoriteRepository.countByUser(user.id),
  ]);

  return c.json<ApiResponse>(
    {
      success: true,
      data: {
        total: result.pagination.total,
        favorites: favoritesCount,
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
      charLogger.error('Search error', error as Error);
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
  const user = c.get('user');
  const characterId = c.req.param('id');

  // Try to get from cache first
  const cached = await cacheService.getCachedCharacter<Character>(characterId);
  if (cached) {
    // IDOR fix: verify the character belongs to the user's tenant or is public
    if (cached.tenantId !== user.tenantId && !cached.isPublic) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Character not found' },
          meta: { timestamp: new Date().toISOString() },
        },
        404
      );
    }
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

  // IDOR fix: verify the character belongs to the user's tenant or is public
  if (character.tenantId !== user.tenantId && !character.isPublic) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Character not found' },
        meta: { timestamp: new Date().toISOString() },
      },
      404
    );
  }

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

    // Auto-save version before update
    try {
      const current = await characterService.getById(characterId);
      if (current.cardData) {
        await characterVersionService.saveVersion(characterId, current.cardData as Record<string, unknown>, user.id, 'Auto-save before edit');
      }
    } catch (e) {
      // Don't block the update if version save fails
      charLogger.warn('Failed to auto-save version', { characterId, error: e });
    }

    const character = await characterService.update(characterId, user.id, user.tenantId, input);

    // Invalidate relevant caches
    await cacheService.invalidateCharacter(characterId);

    eventBus.emit('character.updated', { characterId: character.id, updatedBy: user.id });

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

  eventBus.emit('character.deleted', { characterId, deletedBy: user.id });

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

    eventBus.emit('character.published', { characterId: character.id, creatorId: user.id });

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

  // Create world book from character_book if present in forked character's card data
  const cardData = character.cardData as Record<string, any> | null;
  const characterBook = cardData?.character_book;
  if (
    characterBook &&
    Array.isArray(characterBook.entries) &&
    characterBook.entries.length > 0
  ) {
    await createCharacterWorldBook(
      character.id,
      user.id,
      character.name,
      characterBook
    );
  }

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

// ── Version History Endpoints ──

// List versions for a character
characterRoutes.get('/:id/versions', authMiddleware(), async (c) => {
  const characterId = c.req.param('id');
  const limit = Number(c.req.query('limit') || 20);
  const offset = Number(c.req.query('offset') || 0);

  const versions = await characterVersionService.listVersions(characterId, limit, offset);

  return c.json<ApiResponse>(
    {
      success: true,
      data: versions,
      meta: { timestamp: new Date().toISOString() },
    },
    200,
  );
});

// Get a specific version
characterRoutes.get('/:id/versions/:version', authMiddleware(), async (c) => {
  const characterId = c.req.param('id');
  const version = Number(c.req.param('version'));

  const versionData = await characterVersionService.getVersion(characterId, version);

  if (!versionData) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Version not found' },
        meta: { timestamp: new Date().toISOString() },
      },
      404,
    );
  }

  return c.json<ApiResponse>(
    {
      success: true,
      data: versionData,
      meta: { timestamp: new Date().toISOString() },
    },
    200,
  );
});

// Manually save a version snapshot
characterRoutes.post('/:id/versions', authMiddleware(), async (c) => {
  const user = c.get('user');
  const characterId = c.req.param('id');

  const current = await characterService.getById(characterId);

  if (!current.cardData) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'NO_CARD_DATA', message: 'Character has no card data to snapshot' },
        meta: { timestamp: new Date().toISOString() },
      },
      400,
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const changeNote = body?.changeNote as string | undefined;

  const version = await characterVersionService.saveVersion(
    characterId,
    current.cardData as Record<string, unknown>,
    user.id,
    changeNote,
  );

  return c.json<ApiResponse>(
    {
      success: true,
      data: version,
      meta: { timestamp: new Date().toISOString() },
    },
    201,
  );
});

