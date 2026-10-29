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
import { worldInfoEngine } from '../services/worldinfo-engine.service';
import { countTokens } from '../utils/tokens';
import { db } from '../../db';
import { importStandaloneWorldbook } from '../../db/worldbook-import';
import { prepareStandaloneWorldbook } from '../../types/worldbook-import';
import { worldbooks, worldbookEntries } from '../../db/schema/worldbooks';
import { characters } from '../../db/schema/characters';
import { and, eq } from 'drizzle-orm';
import { AppError, NotFoundError } from '../../core/errors';
import { exportWorldbookEntry } from '../../types/worldbook-export';

/**
 * 把 DB 行（keyword + settings JSONB）显式映射为 world-info 引擎 scanText 期望的条目结构。
 * 读取方式与导出路由保持一致：settings 中的值缺失或类型不符时回退到列值。
 */
function toScanEntry(row: Awaited<ReturnType<typeof worldBookEntryRepository.findByWorldBook>>[number]) {
  const s = (row.settings ?? {}) as Record<string, unknown>;
  const stringArray = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;

  const keys = stringArray(s.keys)?.length
    ? (s.keys as string[])
    : row.keyword.split(',').map((k) => k.trim()).filter(Boolean);

  return {
    id: row.id,
    keys,
    secondaryKeys: stringArray(s.keysSecondary),
    content: row.content,
    comment: typeof s.comment === 'string' ? s.comment : undefined,
    depth: typeof s.depth === 'number' ? s.depth : row.priority,
    constant: s.constant === true,
    selectiveLogic: typeof s.selectiveLogic === 'string' ? s.selectiveLogic : undefined,
    recursive: row.recursive,
    preventRecursion: row.preventRecursion,
  };
}

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
  keyword: z.string(),
  content: z.string().min(1),
  position: z.number().int().default(0),
  isEnabled: z.boolean().default(true),
  priority: z.number().int().default(0),
  settings: z.record(z.unknown()).default({}),
  recursive: z.boolean().default(true),
  preventRecursion: z.boolean().default(false),
});

const updateEntrySchema = z.object({
  keyword: z.string().optional(),
  content: z.string().min(1).optional(),
  position: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  settings: z.record(z.unknown()).optional(),
  recursive: z.boolean().optional(),
  preventRecursion: z.boolean().optional(),
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

    const worldbook = await db.transaction(async transaction => {
      if (input.characterId) {
        const [character] = await transaction.select({ id: characters.id }).from(characters).where(and(
          eq(characters.id, input.characterId), eq(characters.creatorId, user.id), eq(characters.tenantId, user.tenantId),
        )).for('share');
        if (!character) throw new NotFoundError('Character');
        if (input.scope !== 'character') throw new AppError('Bound references require character scope', 409, 'WORLDBOOK_BINDING_SCOPE_UNSUPPORTED');
      }
      const [created] = await transaction.insert(worldbooks).values({
        name: input.name, description: input.description, scope: input.scope,
        userId: user.id, tenantId: user.tenantId, characterId: input.characterId,
      }).returning();
      return created;
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

// Import a standalone world book JSON file (creates world book + entries)
// Must be registered before /:id routes to avoid param capture
worldbooksRouter.post('/import-file', authMiddleware(), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  if (!prepareStandaloneWorldbookSafely(body)) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid world book format' } }, 400);
  }
  const result = await importStandaloneWorldbook(db, { userId: user.id, tenantId: user.tenantId }, body);
  return c.json<ApiResponse>({ success: true, data: result, meta: { timestamp: new Date().toISOString() } }, 201);
});

function prepareStandaloneWorldbookSafely(input: unknown): boolean {
  try { prepareStandaloneWorldbook(input); return true; }
  catch { return false; }
}

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

    const updated = await db.transaction(async transaction => {
      const [current] = await transaction.select().from(worldbooks).where(and(
        eq(worldbooks.id, id), eq(worldbooks.userId, user.id), eq(worldbooks.tenantId, user.tenantId),
      )).for('update');
      if (!current) throw new NotFoundError('World book');
      if (current.characterId && input.scope && input.scope !== 'character') {
        throw new AppError('Unbind this reference before changing its scope', 409, 'WORLDBOOK_BINDING_SCOPE_UNSUPPORTED');
      }
      const [result] = await transaction.update(worldbooks).set({ ...input, updatedAt: new Date() }).where(eq(worldbooks.id, id)).returning();
      return result;
    });

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

    const [entry] = await db.insert(worldbookEntries).values({ ...input, worldbookId: id }).returning();

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

// --- Import / Export ---

// Import entries from SillyTavern character_book format
worldbooksRouter.post('/:id/import', authMiddleware(), async (c) => {
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

  const body = await c.req.json();
  const entries = body.entries;
  if (!entries || typeof entries !== 'object') {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid character_book format: missing entries object' },
        meta: { timestamp: new Date().toISOString() },
      },
      400
    );
  }

  if (!prepareStandaloneWorldbookSafely({ entries })) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid world book entries' } }, 400);
  }
  const prepared = prepareStandaloneWorldbook({ entries });
  await db.transaction(async transaction => {
    for (const entry of prepared.entries) {
      await transaction.insert(worldbookEntries).values({ ...entry, worldbookId: id });
    }
  });

  return c.json<ApiResponse>(
    {
      success: true,
      data: { imported: prepared.entries.length },
      meta: { timestamp: new Date().toISOString() },
    },
    201
  );
});

// Export world book in SillyTavern character_book format
worldbooksRouter.get('/:id/export', authMiddleware(), async (c) => {
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

  const dbEntries = await worldBookEntryRepository.findByWorldBook(id);

  const exportEntries: Record<string, unknown> = {};
  dbEntries.forEach((entry, index) => {
    exportEntries[String(index)] = exportWorldbookEntry(entry);
  });

  return c.json({
    name: worldbook.name,
    entries: exportEntries,
  });
});

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

// Scan entries - test which entries would be triggered by sample text
const scanSchema = z.object({
  text: z.string().min(1),
});

worldbooksRouter.post('/:id/scan', authMiddleware(), zValidator('json', scanSchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { text } = c.req.valid('json');

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

  // Get all entries for this world book
  const entries = await worldBookEntryRepository.findByWorldBook(id);

  // Scan text against entries using the world info engine
  const scanResult = worldInfoEngine.scanText(text, entries.map(toScanEntry));

  // Format results with token counts and recursion depth
  const matches = scanResult.map(match => ({
    id: match.entry.id,
    keys: match.entry.keys,
    secondaryKeys: match.entry.secondaryKeys,
    content: match.entry.content,
    comment: match.entry.comment,
    depth: match.entry.depth,
    constant: match.entry.constant,
    matchedKeys: match.matchedKeys,
    tokens: countTokens(match.entry.content),
    recursionDepth: match.recursionDepth,
  }));

  return c.json<ApiResponse>(
    {
      success: true,
      data: { matches },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

