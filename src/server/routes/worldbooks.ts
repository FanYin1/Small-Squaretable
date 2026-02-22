/**
 * World Books API Routes
 *
 * CRUD endpoints for world books and their entries.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { worldBookRepository } from '../../db/repositories/worldbook.repository';
import { worldBookEntryRepository } from '../../db/repositories/worldbook-entry.repository';
import type { ApiResponse } from '../../types/api';

// --- Validation schemas ---

const createWorldBookSchema = z.object({
  name: z.string().min(1).max(255),
  scope: z.enum(['global', 'character', 'persona', 'chat']).default('global'),
  description: z.string().max(2000).optional(),
  characterId: z.string().uuid().optional(),
});

const updateWorldBookSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  scope: z.enum(['global', 'character', 'persona', 'chat']).optional(),
  description: z.string().max(2000).nullable().optional(),
  isEnabled: z.boolean().optional(),
});

const createEntrySchema = z.object({
  keyword: z.string().min(1),
  content: z.string().min(1),
  position: z.number().int().default(0),
  isEnabled: z.boolean().default(true),
  priority: z.number().int().default(0),
  settings: z.record(z.unknown()).default({}),
});

const updateEntrySchema = z.object({
  keyword: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  position: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  settings: z.record(z.unknown()).optional(),
});

export const worldbooksRouter = new Hono();

// --- World Book CRUD ---

// List user's world books
worldbooksRouter.get('/', authMiddleware(), async (c) => {
  const user = c.get('user');
  const worldbooks = await worldBookRepository.findByUser(user.id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: worldbooks,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// Create world book
worldbooksRouter.post(
  '/',
  authMiddleware(),
  zValidator('json', createWorldBookSchema),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');

    const worldbook = await worldBookRepository.create({
      name: input.name,
      scope: input.scope,
      ownerId: user.id,
      characterId: input.characterId,
    });

    return c.json<ApiResponse>(
      {
        success: true,
        data: worldbook,
        meta: { timestamp: new Date().toISOString() },
      },
      201
    );
  }
);

// Get world book by ID (ownership check)
worldbooksRouter.get('/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const worldbook = await worldBookRepository.findById(id);

  if (!worldbook || worldbook.userId !== user.id) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'World book not found' },
        meta: { timestamp: new Date().toISOString() },
      },
      404
    );
  }

  return c.json<ApiResponse>(
    {
      success: true,
      data: worldbook,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// Update world book (ownership check)
worldbooksRouter.patch(
  '/:id',
  authMiddleware(),
  zValidator('json', updateWorldBookSchema),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const input = c.req.valid('json');

    const worldbook = await worldBookRepository.findById(id);
    if (!worldbook || worldbook.userId !== user.id) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'World book not found' },
          meta: { timestamp: new Date().toISOString() },
        },
        404
      );
    }

    const updated = await worldBookRepository.update(id, input);

    return c.json<ApiResponse>(
      {
        success: true,
        data: updated,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// Delete world book (ownership check)
worldbooksRouter.delete('/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const worldbook = await worldBookRepository.findById(id);
  if (!worldbook || worldbook.userId !== user.id) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'World book not found' },
        meta: { timestamp: new Date().toISOString() },
      },
      404
    );
  }

  await worldBookRepository.delete(id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { message: 'World book deleted successfully' },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// --- Entry CRUD ---

// List entries for a world book (ownership check)
worldbooksRouter.get('/:id/entries', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const worldbook = await worldBookRepository.findById(id);
  if (!worldbook || worldbook.userId !== user.id) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'World book not found' },
        meta: { timestamp: new Date().toISOString() },
      },
      404
    );
  }

  const entries = await worldBookEntryRepository.findByWorldBook(id);

  return c.json<ApiResponse>(
    {
      success: true,
      data: entries,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// Create entry (ownership check)
worldbooksRouter.post(
  '/:id/entries',
  authMiddleware(),
  zValidator('json', createEntrySchema),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const input = c.req.valid('json');

    const worldbook = await worldBookRepository.findById(id);
    if (!worldbook || worldbook.userId !== user.id) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'World book not found' },
          meta: { timestamp: new Date().toISOString() },
        },
        404
      );
    }

    const entry = await worldBookEntryRepository.create({
      worldBookId: id,
      keys: [input.keyword],
      content: input.content,
      order: input.position,
      enabled: input.isEnabled,
      depth: input.priority,
    });

    return c.json<ApiResponse>(
      {
        success: true,
        data: entry,
        meta: { timestamp: new Date().toISOString() },
      },
      201
    );
  }
);

// Update entry
worldbooksRouter.patch(
  '/:id/entries/:entryId',
  authMiddleware(),
  zValidator('json', updateEntrySchema),
  async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const entryId = c.req.param('entryId');
    const input = c.req.valid('json');

    const worldbook = await worldBookRepository.findById(id);
    if (!worldbook || worldbook.userId !== user.id) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'World book not found' },
          meta: { timestamp: new Date().toISOString() },
        },
        404
      );
    }

    const entry = await worldBookEntryRepository.findById(entryId);
    if (!entry || entry.worldbookId !== id) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Entry not found' },
          meta: { timestamp: new Date().toISOString() },
        },
        404
      );
    }

    const updated = await worldBookEntryRepository.update(entryId, input);

    return c.json<ApiResponse>(
      {
        success: true,
        data: updated,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// Delete entry
worldbooksRouter.delete('/:id/entries/:entryId', authMiddleware(), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const entryId = c.req.param('entryId');

  const worldbook = await worldBookRepository.findById(id);
  if (!worldbook || worldbook.userId !== user.id) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'World book not found' },
        meta: { timestamp: new Date().toISOString() },
      },
      404
    );
  }

  const entry = await worldBookEntryRepository.findById(entryId);
  if (!entry || entry.worldbookId !== id) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Entry not found' },
        meta: { timestamp: new Date().toISOString() },
      },
      404
    );
  }

  await worldBookEntryRepository.delete(entryId);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { message: 'Entry deleted successfully' },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});
