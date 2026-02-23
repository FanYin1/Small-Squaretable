/**
 * Character Template Routes Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// Mock logger
vi.mock('../services/logger.service', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock auth middleware — default user is the creator
vi.mock('../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', {
      id: 'user-creator',
      tenantId: 'tenant-123',
      email: 'creator@example.com',
      displayName: 'Creator',
      avatarUrl: null,
      role: 'user',
    });
    return next();
  },
}));

// Mock schema — just needs to be a truthy object for eq() references
vi.mock('../../db/schema/character-templates', () => ({
  characterTemplates: {
    id: 'id',
    creatorId: 'creator_id',
    isPublic: 'is_public',
    category: 'category',
    usageCount: 'usage_count',
  },
}));

// Chainable mock helper
function mockChain(resolvedValue: any) {
  const chain: any = {};
  const terminal = () => Promise.resolve(resolvedValue);
  const methods = [
    'select', 'from', 'where', 'orderBy', 'limit', 'offset',
    'insert', 'update', 'delete', 'set', 'values', 'returning',
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any, reject: any) => terminal().then(resolve, reject);
  return chain;
}

const { dbMockRef } = vi.hoisted(() => {
  const dbMockRef = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return { dbMockRef };
});

vi.mock('../../db', () => ({ db: dbMockRef }));

import { characterTemplateRoutes } from './character-templates';

const mockTemplate = {
  id: 'tpl-1',
  creatorId: 'user-creator',
  name: 'Fantasy Hero',
  description: 'A brave hero template',
  cardData: { personality: 'brave' },
  category: 'fantasy',
  tags: ['rpg', 'hero'],
  isPublic: true,
  usageCount: 10,
  avatarUrl: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('Character Template Routes', () => {
  let app: Hono;
  let dbMock: typeof dbMockRef;

  beforeEach(() => {
    app = new Hono();
    app.route('/templates', characterTemplateRoutes);
    dbMock = dbMockRef;
    vi.clearAllMocks();
  });

  // ── GET / (list public templates) ──

  describe('GET /', () => {
    it('returns paginated public templates', async () => {
      const items = [mockTemplate];
      // First select: items query
      const itemsChain = mockChain(items);
      // Second select: count query
      const countChain = mockChain([{ count: 1 }]);
      dbMock.select.mockReturnValueOnce(itemsChain).mockReturnValueOnce(countChain);

      const res = await app.request('/templates?page=1&limit=10');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.items).toEqual(items);
      expect(body.data.pagination.total).toBe(1);
      expect(body.data.pagination.page).toBe(1);
      expect(body.data.pagination.limit).toBe(10);
    });

    it('filters by category', async () => {
      const itemsChain = mockChain([mockTemplate]);
      const countChain = mockChain([{ count: 1 }]);
      dbMock.select.mockReturnValueOnce(itemsChain).mockReturnValueOnce(countChain);

      const res = await app.request('/templates?category=fantasy');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.items).toHaveLength(1);
    });
  });

  // ── GET /:id (get template by ID) ──

  describe('GET /:id', () => {
    it('returns template by ID', async () => {
      const chain = mockChain([mockTemplate]);
      dbMock.select.mockReturnValue(chain);

      const res = await app.request('/templates/tpl-1');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockTemplate);
    });

    it('returns 404 for non-existent template', async () => {
      const chain = mockChain([]);
      dbMock.select.mockReturnValue(chain);

      const res = await app.request('/templates/non-existent');
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ── POST / (create template) ──

  describe('POST /', () => {
    it('creates template and returns 201', async () => {
      const chain = mockChain([mockTemplate]);
      dbMock.insert.mockReturnValue(chain);

      const res = await app.request('/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Fantasy Hero',
          cardData: { personality: 'brave' },
          category: 'fantasy',
          tags: ['rpg', 'hero'],
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockTemplate);
    });
  });

  // ── PATCH /:id (update template — creator only) ──

  describe('PATCH /:id', () => {
    it('updates template when user is creator', async () => {
      // First select: verify creator
      const selectChain = mockChain([{ creatorId: 'user-creator' }]);
      // Then update
      const updatedTemplate = { ...mockTemplate, name: 'Updated Hero' };
      const updateChain = mockChain([updatedTemplate]);
      dbMock.select.mockReturnValue(selectChain);
      dbMock.update.mockReturnValue(updateChain);

      const res = await app.request('/templates/tpl-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Hero' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Updated Hero');
    });

    it('returns 403 for non-creator', async () => {
      // Creator is a different user
      const selectChain = mockChain([{ creatorId: 'user-other' }]);
      dbMock.select.mockReturnValue(selectChain);

      const res = await app.request('/templates/tpl-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hacked' }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  // ── DELETE /:id (delete template — creator only) ──

  describe('DELETE /:id', () => {
    it('deletes template when user is creator', async () => {
      const selectChain = mockChain([{ creatorId: 'user-creator' }]);
      const deleteChain = mockChain(undefined);
      dbMock.select.mockReturnValue(selectChain);
      dbMock.delete.mockReturnValue(deleteChain);

      const res = await app.request('/templates/tpl-1', { method: 'DELETE' });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toBe('Template deleted successfully');
    });
  });
});
