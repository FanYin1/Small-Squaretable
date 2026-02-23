/**
 * Character Template Rating Routes Tests
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

// Mock auth middleware
vi.mock('../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', {
      id: 'user-rater',
      tenantId: 'tenant-123',
      email: 'rater@example.com',
      displayName: 'Rater',
      avatarUrl: null,
      role: 'user',
    });
    return next();
  },
}));

// Mock schemas
vi.mock('../../db/schema/character-templates', () => ({
  characterTemplates: {
    id: 'id',
    creatorId: 'creator_id',
    isPublic: 'is_public',
    category: 'category',
    usageCount: 'usage_count',
  },
}));

vi.mock('../../db/schema/template-ratings', () => ({
  templateRatings: {
    id: 'id',
    templateId: 'template_id',
    userId: 'user_id',
    rating: 'rating',
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

describe('Character Template Rating Routes', () => {
  let app: Hono;
  let dbMock: typeof dbMockRef;

  beforeEach(() => {
    app = new Hono();
    app.route('/templates', characterTemplateRoutes);
    dbMock = dbMockRef;
    vi.clearAllMocks();
  });

  // ── POST /:id/rate ──

  describe('POST /:id/rate', () => {
    it('creates a new rating for a template', async () => {
      // First select: template exists
      const templateChain = mockChain([mockTemplate]);
      // Second select: no existing rating
      const existingChain = mockChain([]);
      // Insert: new rating
      const insertChain = mockChain([{ id: 'rating-1', rating: 4 }]);

      dbMock.select
        .mockReturnValueOnce(templateChain)
        .mockReturnValueOnce(existingChain);
      dbMock.insert.mockReturnValue(insertChain);

      const res = await app.request('/templates/tpl-1/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 4 }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.rating).toBe(4);
    });

    it('updates an existing rating', async () => {
      // First select: template exists
      const templateChain = mockChain([mockTemplate]);
      // Second select: existing rating found
      const existingChain = mockChain([{ id: 'rating-1', templateId: 'tpl-1', userId: 'user-rater', rating: 3 }]);
      // Update
      const updateChain = mockChain([{ id: 'rating-1', rating: 5 }]);

      dbMock.select
        .mockReturnValueOnce(templateChain)
        .mockReturnValueOnce(existingChain);
      dbMock.update.mockReturnValue(updateChain);

      const res = await app.request('/templates/tpl-1/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 5 }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.rating).toBe(5);
    });
  });

  // ── GET /:id/rating ──

  describe('GET /:id/rating', () => {
    it('returns average rating and count', async () => {
      const avgChain = mockChain([{ avg: 4.2, count: 15 }]);
      dbMock.select.mockReturnValueOnce(avgChain);

      const res = await app.request('/templates/tpl-1/rating');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.average).toBe(4.2);
      expect(body.data.count).toBe(15);
    });
  });
});
