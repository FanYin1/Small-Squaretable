/**
 * Character Collections route tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// Mock auth middleware
vi.mock('../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', {
      id: 'user-123',
      tenantId: 'tenant-123',
      email: 'test@example.com',
      displayName: 'Test User',
      avatarUrl: null,
      role: 'user',
    });
    return next();
  },
}));

// Chainable mock helpers
function mockChain(resolvedValue: any) {
  const chain: any = {};
  const terminal = () => Promise.resolve(resolvedValue);
  const methods = ['select', 'from', 'where', 'orderBy', 'insert', 'update', 'delete', 'set', 'values', 'returning', 'innerJoin', 'onConflictDoNothing'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Make the chain thenable so await works
  chain.then = (resolve: any, reject: any) => terminal().then(resolve, reject);
  return chain;
}

let dbMock: any;

const { dbMockRef } = vi.hoisted(() => {
  const dbMockRef = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return { dbMockRef };
});

vi.mock('@db/index', () => {
  return { db: dbMockRef };
});

import { characterCollectionRoutes } from './character-collections';

describe('Character Collection Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/collections', characterCollectionRoutes);
    dbMock = dbMockRef;
    vi.clearAllMocks();
  });

  // ── GET / (list collections) ──

  describe('GET /collections', () => {
    it('should return 200 with array of collections including itemCount', async () => {
      const mockCollections = [
        { id: 'col-1', name: 'Favorites', itemCount: 3 },
        { id: 'col-2', name: 'RPG', itemCount: 0 },
      ];
      const chain = mockChain(mockCollections);
      dbMock.select.mockReturnValue(chain);

      const res = await app.request('/collections');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockCollections);
      expect(body.meta.timestamp).toBeDefined();
    });
  });

  // ── POST / (create collection) ──

  describe('POST /collections', () => {
    it('should create collection and return 201', async () => {
      const mockCollection = { id: 'col-new', name: 'My Collection', color: '#00FF00' };
      const chain = mockChain([mockCollection]);
      dbMock.insert.mockReturnValue(chain);

      const res = await app.request('/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My Collection', color: '#00FF00' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockCollection);
    });

    it('should return 400 for invalid color format', async () => {
      const res = await app.request('/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test', color: 'red' }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ── PATCH /:id (update collection) ──

  describe('PATCH /collections/:id', () => {
    it('should update collection and return updated data', async () => {
      const mockUpdated = { id: 'col-1', name: 'Renamed', color: '#0000FF', sortOrder: 2 };
      const chain = mockChain([mockUpdated]);
      dbMock.update.mockReturnValue(chain);

      const res = await app.request('/collections/col-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Renamed', color: '#0000FF', sortOrder: 2 }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockUpdated);
    });

    it('should return 404 when collection not found', async () => {
      const chain = mockChain([]);
      dbMock.update.mockReturnValue(chain);

      const res = await app.request('/collections/non-existent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ── DELETE /:id (delete collection) ──

  describe('DELETE /collections/:id', () => {
    it('should delete collection and return success', async () => {
      const chain = mockChain([{ id: 'col-1' }]);
      dbMock.delete.mockReturnValue(chain);

      const res = await app.request('/collections/col-1', { method: 'DELETE' });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.deleted).toBe(true);
    });

    it('should return 404 when deleting non-existent collection', async () => {
      const chain = mockChain([]);
      dbMock.delete.mockReturnValue(chain);

      const res = await app.request('/collections/non-existent', { method: 'DELETE' });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ── POST /:id/characters (add characters) ──

  describe('POST /collections/:id/characters', () => {
    it('should add characters to collection', async () => {
      // First call: select to verify ownership
      const selectChain = mockChain([{ id: 'col-1' }]);
      // Second call: insert items
      const insertChain = mockChain(undefined);
      dbMock.select.mockReturnValueOnce(selectChain);
      dbMock.insert.mockReturnValue(insertChain);

      const res = await app.request('/collections/col-1/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterIds: ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'] }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.added).toBe(2);
    });

    it('should return 404 when adding to non-existent collection', async () => {
      const selectChain = mockChain([]);
      dbMock.select.mockReturnValue(selectChain);

      const res = await app.request('/collections/non-existent/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterIds: ['00000000-0000-0000-0000-000000000001'] }),
      });

      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /:id/characters/:characterId (remove character) ──

  describe('DELETE /collections/:id/characters/:characterId', () => {
    it('should remove character from collection', async () => {
      const selectChain = mockChain([{ id: 'col-1' }]);
      const deleteChain = mockChain(undefined);
      dbMock.select.mockReturnValue(selectChain);
      dbMock.delete.mockReturnValue(deleteChain);

      const res = await app.request('/collections/col-1/characters/char-1', { method: 'DELETE' });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.removed).toBe(true);
    });

    it('should return 404 when removing from non-existent collection', async () => {
      const selectChain = mockChain([]);
      dbMock.select.mockReturnValue(selectChain);

      const res = await app.request('/collections/non-existent/characters/char-1', { method: 'DELETE' });

      expect(res.status).toBe(404);
    });
  });

  // ── GET /:id/characters (list characters in collection) ──

  describe('GET /collections/:id/characters', () => {
    it('should return joined character data', async () => {
      const mockItems = [
        { id: 'char-1', name: 'Alice', description: 'A character', avatarUrl: null, tags: ['rpg'], category: 'fantasy', isPublic: true, isNsfw: false },
        { id: 'char-2', name: 'Bob', description: null, avatarUrl: null, tags: [], category: null, isPublic: false, isNsfw: false },
      ];
      // First select: ownership check
      const selectChain1 = mockChain([{ id: 'col-1' }]);
      // Second select: character list
      const selectChain2 = mockChain(mockItems);
      dbMock.select.mockReturnValueOnce(selectChain1).mockReturnValueOnce(selectChain2);

      const res = await app.request('/collections/col-1/characters');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockItems);
    });

    it('should return 404 for non-existent collection', async () => {
      const selectChain = mockChain([]);
      dbMock.select.mockReturnValue(selectChain);

      const res = await app.request('/collections/non-existent/characters');

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ── GET /public/:userId (list public collections) ──

  describe('GET /collections/public/:userId', () => {
    it('should return only public collections for a user', async () => {
      const mockPublicCollections = [
        { id: 'col-1', name: 'Public RPG', isPublic: true, itemCount: 5 },
      ];
      const chain = mockChain(mockPublicCollections);
      dbMock.select.mockReturnValue(chain);

      const res = await app.request('/collections/public/user-456');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockPublicCollections);
    });
  });

  // ── GET /public/:userId/:id/characters (view public collection characters) ──

  describe('GET /collections/public/:userId/:id/characters', () => {
    it('should return character data for a public collection', async () => {
      const mockChars = [
        { id: 'char-1', name: 'Alice', description: 'A character', avatarUrl: null, tags: ['rpg'], category: 'fantasy' },
      ];
      // First select: verify public collection
      const selectChain1 = mockChain([{ id: 'col-1' }]);
      // Second select: character list
      const selectChain2 = mockChain(mockChars);
      dbMock.select.mockReturnValueOnce(selectChain1).mockReturnValueOnce(selectChain2);

      const res = await app.request('/collections/public/user-456/col-1/characters');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockChars);
    });

    it('should return 404 for non-public collection', async () => {
      const selectChain = mockChain([]);
      dbMock.select.mockReturnValue(selectChain);

      const res = await app.request('/collections/public/user-456/col-private/characters');
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});