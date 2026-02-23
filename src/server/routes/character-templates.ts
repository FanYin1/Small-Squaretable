/**
 * Character Template Routes
 *
 * CRUD for character templates and a "use" endpoint to increment usage count.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '../../db';
import { characterTemplates } from '../../db/schema/character-templates';
import { templateRatings } from '../../db/schema/template-ratings';
import { authMiddleware } from '../middleware/auth';
import { createLogger } from '../services/logger.service';
import { paginationSchema } from '../../types/api';
import type { ApiResponse, PaginatedResponse } from '../../types/api';
import type { CharacterTemplate } from '../../db/schema/character-templates';

const logger = createLogger({ service: 'character-templates' });

export const characterTemplateRoutes = new Hono();

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  cardData: z.record(z.unknown()),
  category: z.string().max(50).optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
  avatarUrl: z.string().optional(),
});

const updateTemplateSchema = createTemplateSchema.partial();

// GET / — List public templates with pagination
characterTemplateRoutes.get(
  '/',
  async (c) => {
    try {
      const query = c.req.query();
      const pagination = paginationSchema.parse(query);
      const category = query.category;

      const offset = (pagination.page - 1) * pagination.limit;

      const conditions = [eq(characterTemplates.isPublic, true)];
      if (category) {
        conditions.push(eq(characterTemplates.category, category));
      }

      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

      const items = await db
        .select()
        .from(characterTemplates)
        .where(whereClause)
        .orderBy(desc(characterTemplates.usageCount))
        .limit(pagination.limit)
        .offset(offset);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(characterTemplates)
        .where(whereClause);

      const total = countResult?.count ?? 0;
      const totalPages = Math.ceil(total / pagination.limit);

      const response: PaginatedResponse<CharacterTemplate> = {
        items,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages,
          hasNext: pagination.page < totalPages,
          hasPrev: pagination.page > 1,
        },
      };

      return c.json<ApiResponse>(
        { success: true, data: response, meta: { timestamp: new Date().toISOString() } },
        200,
      );
    } catch (error) {
      logger.error('Failed to list templates', { error: String(error) });
      return c.json<ApiResponse>(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list templates' }, meta: { timestamp: new Date().toISOString() } },
        500,
      );
    }
  },
);

// GET /mine — List current user's templates
characterTemplateRoutes.get('/mine', authMiddleware(), async (c) => {
  const user = c.get('user');
  try {
    const templates = await db.select().from(characterTemplates)
      .where(eq(characterTemplates.creatorId, user.id))
      .orderBy(desc(characterTemplates.updatedAt));
    return c.json<ApiResponse>({
      success: true,
      data: templates,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    logger.error('Failed to list user templates', { error: String(error) });
    return c.json<ApiResponse>(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list templates' }, meta: { timestamp: new Date().toISOString() } },
      500,
    );
  }
});

// GET /:id — Get template by ID
characterTemplateRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const [template] = await db
      .select()
      .from(characterTemplates)
      .where(eq(characterTemplates.id, id))
      .limit(1);

    if (!template) {
      return c.json<ApiResponse>(
        { success: false, error: { code: 'NOT_FOUND', message: 'Template not found' }, meta: { timestamp: new Date().toISOString() } },
        404,
      );
    }

    return c.json<ApiResponse>(
      { success: true, data: template, meta: { timestamp: new Date().toISOString() } },
      200,
    );
  } catch (error) {
    logger.error('Failed to get template', { error: String(error), id });
    return c.json<ApiResponse>(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get template' }, meta: { timestamp: new Date().toISOString() } },
      500,
    );
  }
});

// POST / — Create template (auth required)
characterTemplateRoutes.post(
  '/',
  authMiddleware(),
  zValidator('json', createTemplateSchema),
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    try {
      const [template] = await db
        .insert(characterTemplates)
        .values({
          creatorId: user.id,
          name: body.name,
          description: body.description,
          cardData: body.cardData,
          category: body.category,
          tags: body.tags,
          isPublic: body.isPublic ?? true,
          avatarUrl: body.avatarUrl,
        })
        .returning();

      logger.info('Template created', { templateId: template.id, creatorId: user.id });

      return c.json<ApiResponse>(
        { success: true, data: template, meta: { timestamp: new Date().toISOString() } },
        201,
      );
    } catch (error) {
      logger.error('Failed to create template', { error: String(error) });
      return c.json<ApiResponse>(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create template' }, meta: { timestamp: new Date().toISOString() } },
        500,
      );
    }
  },
);

// PATCH /:id — Update template (creator only)
characterTemplateRoutes.patch(
  '/:id',
  authMiddleware(),
  zValidator('json', updateTemplateSchema),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = c.req.valid('json');

    try {
      // Verify creator
      const [existing] = await db
        .select({ creatorId: characterTemplates.creatorId })
        .from(characterTemplates)
        .where(eq(characterTemplates.id, id))
        .limit(1);

      if (!existing) {
        return c.json<ApiResponse>(
          { success: false, error: { code: 'NOT_FOUND', message: 'Template not found' }, meta: { timestamp: new Date().toISOString() } },
          404,
        );
      }

      if (existing.creatorId !== user.id) {
        return c.json<ApiResponse>(
          { success: false, error: { code: 'FORBIDDEN', message: 'Only the template creator can update it' }, meta: { timestamp: new Date().toISOString() } },
          403,
        );
      }

      const [updated] = await db
        .update(characterTemplates)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(characterTemplates.id, id))
        .returning();

      logger.info('Template updated', { templateId: id, updatedBy: user.id });

      return c.json<ApiResponse>(
        { success: true, data: updated, meta: { timestamp: new Date().toISOString() } },
        200,
      );
    } catch (error) {
      logger.error('Failed to update template', { error: String(error), id });
      return c.json<ApiResponse>(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update template' }, meta: { timestamp: new Date().toISOString() } },
        500,
      );
    }
  },
);

// DELETE /:id — Delete template (creator only)
characterTemplateRoutes.delete(
  '/:id',
  authMiddleware(),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');

    try {
      const [existing] = await db
        .select({ creatorId: characterTemplates.creatorId })
        .from(characterTemplates)
        .where(eq(characterTemplates.id, id))
        .limit(1);

      if (!existing) {
        return c.json<ApiResponse>(
          { success: false, error: { code: 'NOT_FOUND', message: 'Template not found' }, meta: { timestamp: new Date().toISOString() } },
          404,
        );
      }

      if (existing.creatorId !== user.id) {
        return c.json<ApiResponse>(
          { success: false, error: { code: 'FORBIDDEN', message: 'Only the template creator can delete it' }, meta: { timestamp: new Date().toISOString() } },
          403,
        );
      }

      await db
        .delete(characterTemplates)
        .where(eq(characterTemplates.id, id));

      logger.info('Template deleted', { templateId: id, deletedBy: user.id });

      return c.json<ApiResponse>(
        { success: true, data: { message: 'Template deleted successfully' }, meta: { timestamp: new Date().toISOString() } },
        200,
      );
    } catch (error) {
      logger.error('Failed to delete template', { error: String(error), id });
      return c.json<ApiResponse>(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete template' }, meta: { timestamp: new Date().toISOString() } },
        500,
      );
    }
  },
);

// POST /:id/use — Use a template (increment usage count)
characterTemplateRoutes.post(
  '/:id/use',
  authMiddleware(),
  async (c) => {
    const id = c.req.param('id');

    try {
      const [template] = await db
        .update(characterTemplates)
        .set({ usageCount: sql`${characterTemplates.usageCount} + 1` })
        .where(eq(characterTemplates.id, id))
        .returning();

      if (!template) {
        return c.json<ApiResponse>(
          { success: false, error: { code: 'NOT_FOUND', message: 'Template not found' }, meta: { timestamp: new Date().toISOString() } },
          404,
        );
      }

      logger.info('Template used', { templateId: id });

      return c.json<ApiResponse>(
        { success: true, data: template, meta: { timestamp: new Date().toISOString() } },
        200,
      );
    } catch (error) {
      logger.error('Failed to use template', { error: String(error), id });
      return c.json<ApiResponse>(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to use template' }, meta: { timestamp: new Date().toISOString() } },
        500,
      );
    }
  },
);

// POST /:id/rate — Rate a template (upsert)
characterTemplateRoutes.post(
  '/:id/rate',
  authMiddleware(),
  zValidator('json', z.object({ rating: z.number().int().min(1).max(5) })),
  async (c) => {
    const user = c.get('user');
    const templateId = c.req.param('id');
    const { rating } = c.req.valid('json');

    try {
      // Verify template exists
      const [template] = await db
        .select()
        .from(characterTemplates)
        .where(eq(characterTemplates.id, templateId))
        .limit(1);

      if (!template) {
        return c.json<ApiResponse>(
          { success: false, error: { code: 'NOT_FOUND', message: 'Template not found' }, meta: { timestamp: new Date().toISOString() } },
          404,
        );
      }

      // Upsert rating
      const [existing] = await db
        .select()
        .from(templateRatings)
        .where(and(eq(templateRatings.templateId, templateId), eq(templateRatings.userId, user.id)));

      if (existing) {
        await db.update(templateRatings).set({ rating }).where(eq(templateRatings.id, existing.id));
      } else {
        await db.insert(templateRatings).values({ templateId, userId: user.id, rating });
      }

      logger.info('Template rated', { templateId, userId: user.id, rating });

      return c.json<ApiResponse>(
        { success: true, data: { rating }, meta: { timestamp: new Date().toISOString() } },
        200,
      );
    } catch (error) {
      logger.error('Failed to rate template', { error: String(error), templateId });
      return c.json<ApiResponse>(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to rate template' }, meta: { timestamp: new Date().toISOString() } },
        500,
      );
    }
  },
);

// GET /:id/rating — Get average rating and count for a template
characterTemplateRoutes.get('/:id/rating', async (c) => {
  const templateId = c.req.param('id');

  try {
    const avgResult = await db
      .select({
        avg: sql<number>`COALESCE(AVG(rating), 0)::float`,
        count: sql<number>`count(*)::int`,
      })
      .from(templateRatings)
      .where(eq(templateRatings.templateId, templateId));

    return c.json<ApiResponse>(
      {
        success: true,
        data: {
          average: Math.round((avgResult[0]?.avg || 0) * 10) / 10,
          count: avgResult[0]?.count || 0,
        },
        meta: { timestamp: new Date().toISOString() },
      },
      200,
    );
  } catch (error) {
    logger.error('Failed to get template rating', { error: String(error), templateId });
    return c.json<ApiResponse>(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get rating' }, meta: { timestamp: new Date().toISOString() } },
      500,
    );
  }
});
