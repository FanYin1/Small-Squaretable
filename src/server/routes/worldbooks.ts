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
  recursive: z.boolean().default(true),
  preventRecursion: z.boolean().default(false),
});

const updateEntrySchema = z.object({
  keyword: z.string().min(1).optional(),
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

// Import a standalone world book JSON file (creates world book + entries)
// Must be registered before /:id routes to avoid param capture
worldbooksRouter.post('/import-file', authMiddleware(), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const entries = body.entries;
  if (!entries || typeof entries !== 'object') {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid world book format: missing entries object' },
        meta: { timestamp: new Date().toISOString() },
      },
      400
    );
  }

  const name = body.name || body.originalData?.name || 'Imported World Book';
  const description = body.description || body.originalData?.description || null;

  const worldBook = await worldBookRepository.create({
    name,
    scope: 'global',
    ownerId: user.id,
    settings: {},
  });

  const positionMap: Record<number, string> = {
    0: 'before', 1: 'after', 2: 'ANTop', 3: 'ANBottom',
    4: 'atDepth', 5: 'EMTop', 6: 'EMBottom',
  };
  const selectiveLogicMap: Record<number, string> = {
    0: 'AND_ANY', 1: 'AND_ALL', 2: 'NOT_ANY', 3: 'NOT_ALL',
  };

  const entryKeys = Object.keys(entries).sort((a, b) => Number(a) - Number(b));
  let importedCount = 0;

  for (const key of entryKeys) {
    const e = entries[key];
    if (!e || typeof e !== 'object') continue;

    const primaryKeys = Array.isArray(e.keys) ? e.keys
      : Array.isArray(e.key) ? e.key : [];
    const secondaryKeys = Array.isArray(e.secondary_keys) ? e.secondary_keys
      : Array.isArray(e.keysecondary) ? e.keysecondary : undefined;
    const order = typeof e.insertion_order === 'number' ? e.insertion_order
      : typeof e.order === 'number' ? e.order : 100;
    const enabled = typeof e.enabled === 'boolean' ? e.enabled
      : typeof e.disable === 'boolean' ? !e.disable : true;
    const position = typeof e.position === 'number'
      ? (positionMap[e.position] ?? 'before')
      : typeof e.position === 'string' ? e.position : 'before';
    const extPosition = e.extensions?.position;
    const finalPosition = typeof extPosition === 'number'
      ? (positionMap[extPosition] ?? position) : position;
    const depth = typeof e.depth === 'number' ? e.depth
      : typeof e.extensions?.depth === 'number' ? e.extensions.depth : 4;

    await worldBookEntryRepository.create({
      worldBookId: worldBook.id,
      keys: primaryKeys,
      keysSecondary: secondaryKeys,
      selectiveLogic: selectiveLogicMap[e.selectiveLogic] ?? 'AND_ANY',
      content: typeof e.content === 'string' ? e.content : '',
      comment: typeof e.comment === 'string' ? e.comment
        : typeof e.name === 'string' ? e.name : null,
      position: finalPosition,
      depth,
      order,
      enabled,
      constant: e.constant === true,
      probability: typeof e.probability === 'number' ? e.probability : 100,
      sticky: typeof e.sticky === 'number' ? e.sticky : 0,
      cooldown: typeof e.cooldown === 'number' ? e.cooldown : 0,
      delay: typeof e.delay === 'number' ? e.delay : 0,
      caseSensitive: e.case_sensitive === true || e.caseSensitive === true,
      matchWholeWords: e.match_whole_words === true || e.matchWholeWords === true,
      preventRecursion: e.prevent_recursion === true || e.preventRecursion === true,
      excludeRecursion: e.exclude_recursion === true || e.excludeRecursion === true,
    });
    importedCount++;
  }

  return c.json<ApiResponse>(
    {
      success: true,
      data: { worldBookId: worldBook.id, name, imported: importedCount },
      meta: { timestamp: new Date().toISOString() },
    },
    201
  );
});

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
      recursive: input.recursive,
      preventRecursion: input.preventRecursion,
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

  const positionMap: Record<number, string> = {
    0: 'before', 1: 'after', 2: 'ANTop', 3: 'ANBottom',
    4: 'atDepth', 5: 'EMTop', 6: 'EMBottom',
  };

  const selectiveLogicMap: Record<number, string> = {
    0: 'AND_ANY', 1: 'AND_ALL', 2: 'NOT_ANY', 3: 'NOT_ALL',
  };

  const created: unknown[] = [];
  const entryKeys = Object.keys(entries).sort((a, b) => Number(a) - Number(b));

  for (const key of entryKeys) {
    const e = entries[key];
    if (!e || typeof e !== 'object') continue;

    // Normalize field names: support both character_book format (keys, secondary_keys,
    // insertion_order, enabled) and standalone world book format (key, keysecondary,
    // order, disable)
    const primaryKeys = Array.isArray(e.keys) ? e.keys
      : Array.isArray(e.key) ? e.key
      : [];
    const secondaryKeys = Array.isArray(e.secondary_keys) ? e.secondary_keys
      : Array.isArray(e.keysecondary) ? e.keysecondary
      : undefined;
    const order = typeof e.insertion_order === 'number' ? e.insertion_order
      : typeof e.order === 'number' ? e.order
      : 100;
    // 'enabled' (true=on) vs 'disable' (false=on, inverted logic)
    const enabled = typeof e.enabled === 'boolean' ? e.enabled
      : typeof e.disable === 'boolean' ? !e.disable
      : true;
    const position = typeof e.position === 'number'
      ? (positionMap[e.position] ?? 'before')
      : typeof e.position === 'string'
        ? e.position
        : 'before';
    // extensions.position overrides top-level position (SillyTavern V3 behavior)
    const extPosition = e.extensions?.position;
    const finalPosition = typeof extPosition === 'number'
      ? (positionMap[extPosition] ?? position)
      : position;
    const depth = typeof e.depth === 'number' ? e.depth
      : typeof e.extensions?.depth === 'number' ? e.extensions.depth
      : 4;

    const entry = await worldBookEntryRepository.create({
      worldBookId: id,
      keys: primaryKeys,
      keysSecondary: secondaryKeys,
      selectiveLogic: selectiveLogicMap[e.selectiveLogic] ?? 'AND_ANY',
      content: typeof e.content === 'string' ? e.content : '',
      comment: typeof e.comment === 'string' ? e.comment
        : typeof e.name === 'string' ? e.name
        : null,
      position: finalPosition,
      depth,
      order,
      enabled,
      constant: e.constant === true,
      probability: typeof e.probability === 'number' ? e.probability : 100,
      sticky: typeof e.sticky === 'number' ? e.sticky : 0,
      cooldown: typeof e.cooldown === 'number' ? e.cooldown : 0,
      delay: typeof e.delay === 'number' ? e.delay : 0,
      caseSensitive: e.case_sensitive === true || e.caseSensitive === true,
      matchWholeWords: e.match_whole_words === true || e.matchWholeWords === true,
      preventRecursion: e.prevent_recursion === true || e.preventRecursion === true,
      excludeRecursion: e.exclude_recursion === true || e.excludeRecursion === true,
    });
    created.push(entry);
  }

  return c.json<ApiResponse>(
    {
      success: true,
      data: { imported: created.length },
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

  const positionReverseMap: Record<string, number> = {
    before: 0, after: 1, EMTop: 2, EMBottom: 3,
    atDepth: 4, ANTop: 5, ANBottom: 6,
  };

  const selectiveLogicReverseMap: Record<string, number> = {
    AND_ANY: 0, AND_ALL: 1, NOT_ANY: 2, NOT_ALL: 3,
  };

  const exportEntries: Record<string, unknown> = {};
  dbEntries.forEach((entry, index) => {
    const s = (entry.settings ?? {}) as Record<string, unknown>;
    const keys = Array.isArray(s.keys) ? s.keys : entry.keyword ? entry.keyword.split(',').map((k: string) => k.trim()).filter(Boolean) : [];
    const secondaryKeys = Array.isArray(s.keysSecondary) ? s.keysSecondary : [];
    const posStr = typeof s.position === 'string' ? s.position : 'before';
    const logicStr = typeof s.selectiveLogic === 'string' ? s.selectiveLogic : 'AND_ANY';

    exportEntries[String(index)] = {
      keys,
      secondary_keys: secondaryKeys,
      selectiveLogic: selectiveLogicReverseMap[logicStr] ?? 0,
      content: entry.content,
      comment: typeof s.comment === 'string' ? s.comment : '',
      position: positionReverseMap[posStr] ?? 0,
      depth: typeof s.depth === 'number' ? s.depth : 4,
      insertion_order: typeof s.order === 'number' ? s.order : entry.position,
      enabled: entry.isEnabled,
      constant: s.constant === true,
      probability: typeof s.probability === 'number' ? s.probability : 100,
      sticky: typeof s.sticky === 'number' ? s.sticky : 0,
      cooldown: typeof s.cooldown === 'number' ? s.cooldown : 0,
      delay: typeof s.delay === 'number' ? s.delay : 0,
      case_sensitive: s.caseSensitive === true,
      match_whole_words: s.matchWholeWords === true,
      prevent_recursion: s.preventRecursion === true,
      exclude_recursion: s.excludeRecursion === true,
    };
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
  const scanResult = worldInfoEngine.scanText(text, entries);

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

