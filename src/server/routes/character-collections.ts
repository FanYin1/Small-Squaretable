import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '@db/index';
import { characterCollections, characterCollectionItems } from '@db/schema/character-collections';
import { characters } from '@db/schema/characters';
import { eq, and, sql } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import type { ApiResponse } from '@/types/api';

export const characterCollectionRoutes = new Hono();

// GET / — list user's collections with item count
characterCollectionRoutes.get('/', authMiddleware(), async (c) => {
  const user = c.get('user') as { id: string };

  const collections = await db
    .select({
      id: characterCollections.id,
      name: characterCollections.name,
      description: characterCollections.description,
      color: characterCollections.color,
      sortOrder: characterCollections.sortOrder,
      createdAt: characterCollections.createdAt,
      updatedAt: characterCollections.updatedAt,
      itemCount: sql<number>`(SELECT COUNT(*) FROM character_collection_items WHERE collection_id = ${characterCollections.id})`.as('item_count'),
    })
    .from(characterCollections)
    .where(eq(characterCollections.userId, user.id))
    .orderBy(characterCollections.sortOrder);

  return c.json<ApiResponse>({ success: true, data: collections, meta: { timestamp: new Date().toISOString() } });
});

// POST / — create collection
const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

characterCollectionRoutes.post('/', authMiddleware(), zValidator('json', createSchema), async (c) => {
  const user = c.get('user') as { id: string };
  const input = c.req.valid('json');

  const [collection] = await db.insert(characterCollections).values({
    userId: user.id,
    name: input.name,
    description: input.description,
    color: input.color,
  }).returning();

  return c.json<ApiResponse>({ success: true, data: collection, meta: { timestamp: new Date().toISOString() } }, 201);
});

// PATCH /:id — update collection
const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

characterCollectionRoutes.patch('/:id', authMiddleware(), zValidator('json', updateSchema), async (c) => {
  const user = c.get('user') as { id: string };
  const collectionId = c.req.param('id');
  const input = c.req.valid('json');

  const [updated] = await db.update(characterCollections)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(characterCollections.id, collectionId), eq(characterCollections.userId, user.id)))
    .returning();

  if (!updated) {
    return c.json<ApiResponse>({ success: false, error: { code: 'NOT_FOUND', message: 'Collection not found' }, meta: { timestamp: new Date().toISOString() } }, 404);
  }

  return c.json<ApiResponse>({ success: true, data: updated, meta: { timestamp: new Date().toISOString() } });
});

// DELETE /:id — delete collection
characterCollectionRoutes.delete('/:id', authMiddleware(), async (c) => {
  const user = c.get('user') as { id: string };
  const collectionId = c.req.param('id');

  const [deleted] = await db.delete(characterCollections)
    .where(and(eq(characterCollections.id, collectionId), eq(characterCollections.userId, user.id)))
    .returning({ id: characterCollections.id });

  if (!deleted) {
    return c.json<ApiResponse>({ success: false, error: { code: 'NOT_FOUND', message: 'Collection not found' }, meta: { timestamp: new Date().toISOString() } }, 404);
  }

  return c.json<ApiResponse>({ success: true, data: { deleted: true }, meta: { timestamp: new Date().toISOString() } });
});

// POST /:id/characters — add characters to collection
const addCharsSchema = z.object({
  characterIds: z.array(z.string().uuid()).min(1).max(50),
});

characterCollectionRoutes.post('/:id/characters', authMiddleware(), zValidator('json', addCharsSchema), async (c) => {
  const user = c.get('user') as { id: string };
  const collectionId = c.req.param('id');
  const { characterIds } = c.req.valid('json');

  // Verify collection belongs to user
  const [collection] = await db.select({ id: characterCollections.id })
    .from(characterCollections)
    .where(and(eq(characterCollections.id, collectionId), eq(characterCollections.userId, user.id)));

  if (!collection) {
    return c.json<ApiResponse>({ success: false, error: { code: 'NOT_FOUND', message: 'Collection not found' }, meta: { timestamp: new Date().toISOString() } }, 404);
  }

  const values = characterIds.map((characterId) => ({
    collectionId,
    characterId,
  }));

  try {
    await db.insert(characterCollectionItems).values(values).onConflictDoNothing();
  } catch {
    // Some characters may not exist — that's ok, just skip
  }

  return c.json<ApiResponse>({ success: true, data: { added: characterIds.length }, meta: { timestamp: new Date().toISOString() } });
});

// DELETE /:id/characters/:characterId — remove character from collection
characterCollectionRoutes.delete('/:id/characters/:characterId', authMiddleware(), async (c) => {
  const user = c.get('user') as { id: string };
  const collectionId = c.req.param('id');
  const characterId = c.req.param('characterId');

  const [col] = await db.select({ id: characterCollections.id })
    .from(characterCollections)
    .where(and(eq(characterCollections.id, collectionId), eq(characterCollections.userId, user.id)));

  if (!col) {
    return c.json<ApiResponse>({ success: false, error: { code: 'NOT_FOUND', message: 'Collection not found' }, meta: { timestamp: new Date().toISOString() } }, 404);
  }

  await db.delete(characterCollectionItems)
    .where(and(
      eq(characterCollectionItems.collectionId, collectionId),
      eq(characterCollectionItems.characterId, characterId),
    ));

  return c.json<ApiResponse>({ success: true, data: { removed: true }, meta: { timestamp: new Date().toISOString() } });
});

// GET /:id/characters — list characters in collection
characterCollectionRoutes.get('/:id/characters', authMiddleware(), async (c) => {
  const user = c.get('user') as { id: string };
  const collectionId = c.req.param('id');

  // Verify collection belongs to user
  const [collection] = await db.select({ id: characterCollections.id })
    .from(characterCollections)
    .where(and(eq(characterCollections.id, collectionId), eq(characterCollections.userId, user.id)));

  if (!collection) {
    return c.json<ApiResponse>({ success: false, error: { code: 'NOT_FOUND', message: 'Collection not found' }, meta: { timestamp: new Date().toISOString() } }, 404);
  }

  const items = await db
    .select({
      id: characters.id,
      name: characters.name,
      description: characters.description,
      avatarUrl: characters.avatarUrl,
      tags: characters.tags,
      category: characters.category,
      isPublic: characters.isPublic,
      isNsfw: characters.isNsfw,
      createdAt: characters.createdAt,
      updatedAt: characters.updatedAt,
    })
    .from(characterCollectionItems)
    .innerJoin(characters, eq(characterCollectionItems.characterId, characters.id))
    .where(eq(characterCollectionItems.collectionId, collectionId))
    .orderBy(characterCollectionItems.sortOrder);

  return c.json<ApiResponse>({ success: true, data: items, meta: { timestamp: new Date().toISOString() } });
});