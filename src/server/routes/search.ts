/**
 * Global Search Routes
 *
 * Provides unified search across characters, messages, and worldbooks,
 * plus typeahead suggestions with pg_trgm similarity.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { characters } from '@/db/schema/characters';
import { authMiddleware } from '../middleware/auth';
import { searchService } from '../services/search.service';
import { messageRepository } from '@/db/repositories/message.repository';
import { worldBookEntryRepository } from '@/db/repositories/worldbook-entry.repository';
import { cacheService } from '../services/cache.service';
import { getRedisClient } from '@/core/redis';
import { createLogger } from '../services/logger.service';
import { createHash } from 'crypto';
import type { ApiResponse } from '@/types/api';

const searchLogger = createLogger({ service: 'search-route' });

// ── Validation Schemas ──

const globalSearchSchema = z.object({
  q: z.string().min(1).max(200),
  type: z.enum(['all', 'characters', 'messages', 'worldbooks']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: z.string().max(50).optional(),
  tags: z.string().max(500).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

const suggestionsSchema = z.object({
  q: z.string().min(1).max(100),
});

// ── Helpers ──

function hashParams(...parts: string[]): string {
  return createHash('md5').update(parts.join(':')).digest('hex');
}

// ── Router ──

export const searchRoutes = new Hono();

// ── GET / — Unified global search ──

searchRoutes.get(
  '/',
  authMiddleware(),
  zValidator('query', globalSearchSchema),
  async (c) => {
    const user = c.get('user') as { id: string; tenantId: string };
    const { q, type, page, limit, category, tags, dateFrom, dateTo } = c.req.valid('query');

    try {
      // Check cache
      const cacheKey = `search:global:${user.id}:${hashParams(q, type, String(page), String(limit), category || '', tags || '', dateFrom || '', dateTo || '')}`;
      const cached = await cacheService.get<Record<string, unknown>>(cacheKey);
      if (cached) {
        c.header('X-Cache', 'HIT');
        return c.json<ApiResponse>({
          success: true,
          data: cached,
          meta: { timestamp: new Date().toISOString() },
        });
      }

      // Run searches in parallel based on type
      const searchCharacters = type === 'all' || type === 'characters';
      const searchMessages = type === 'all' || type === 'messages';
      const searchWorldbooks = type === 'all' || type === 'worldbooks';

      const [charResult, msgResult, wbResult] = await Promise.all([
        searchCharacters
          ? searchService.searchCharacters({
              query: q,
              sort: 'relevance',
              filter: 'all',
              userId: user.id,
              page,
              limit,
              category: category || undefined,
              tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
              dateFrom: dateFrom || undefined,
              dateTo: dateTo || undefined,
            })
          : null,
        searchMessages
          ? messageRepository.searchGlobal(user.id, q, limit)
          : null,
        searchWorldbooks
          ? worldBookEntryRepository.searchByUser(user.id, q, limit)
          : null,
      ]);

      const data = {
        characters: charResult?.items ?? [],
        messages: msgResult ?? [],
        worldbooks: wbResult ?? [],
        total:
          (charResult?.pagination.total ?? 0) +
          (msgResult?.length ?? 0) +
          (wbResult?.length ?? 0),
      };

      // Cache result for 60s
      await cacheService.set(cacheKey, data, 60);

      // Store recent search in Redis
      try {
        const redisClient = await getRedisClient();
        const recentKey = `search:recent:${user.id}`;
        await redisClient.lPush(recentKey, q);
        await redisClient.lTrim(recentKey, 0, 9);
      } catch (redisErr) {
        searchLogger.warn('Failed to store recent search', { error: String(redisErr) });
      }

      c.header('X-Cache', 'MISS');
      return c.json<ApiResponse>({
        success: true,
        data,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      searchLogger.error('Global search error', { error: String(error) });
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'SEARCH_ERROR', message: 'Failed to perform search' },
          meta: { timestamp: new Date().toISOString() },
        },
        500,
      );
    }
  },
);

// ── GET /suggestions — Typeahead suggestions ──

searchRoutes.get(
  '/suggestions',
  authMiddleware(),
  zValidator('query', suggestionsSchema),
  async (c) => {
    const user = c.get('user') as { id: string };
    const { q } = c.req.valid('query');

    try {
      // Query character names using pg_trgm similarity
      const charSuggestions = await db
        .select({
          id: characters.id,
          name: characters.name,
          avatarUrl: characters.avatarUrl,
        })
        .from(characters)
        .where(
          sql`(${characters.isPublic} = true OR ${characters.creatorId} = ${user.id}) AND similarity(${characters.name}, ${q}) > 0.1`,
        )
        .orderBy(sql`similarity(${characters.name}, ${q}) DESC`)
        .limit(5);

      // Get recent searches from Redis
      let recentSearches: string[] = [];
      try {
        const redisClient = await getRedisClient();
        recentSearches = await redisClient.lRange(`search:recent:${user.id}`, 0, 9);
      } catch (redisErr) {
        searchLogger.warn('Failed to fetch recent searches', { error: String(redisErr) });
      }

      return c.json<ApiResponse>({
        success: true,
        data: {
          characters: charSuggestions,
          recentSearches,
        },
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      searchLogger.error('Suggestions error', { error: String(error) });
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'SUGGESTION_ERROR', message: 'Failed to fetch suggestions' },
          meta: { timestamp: new Date().toISOString() },
        },
        500,
      );
    }
  },
);
