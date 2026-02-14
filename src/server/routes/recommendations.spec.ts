import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';

// Mock auth middleware
vi.mock('../middleware/auth', () => ({
  authMiddleware: () =>
    createMiddleware(async (c, next) => {
      const user = c.get('user');
      if (!user) {
        return c.json({ success: false, error: 'Unauthorized' }, 401);
      }
      await next();
    }),
  optionalAuthMiddleware: () =>
    createMiddleware(async (_c, next) => {
      await next();
    }),
}));

const mockGetPersonalized = vi.fn();
const mockGetTrending = vi.fn();
const mockGetSimilar = vi.fn();

vi.mock('../services/recommendation.service', () => ({
  recommendationService: {
    getPersonalized: (...args: unknown[]) => mockGetPersonalized(...args),
    getTrending: (...args: unknown[]) => mockGetTrending(...args),
    getSimilar: (...args: unknown[]) => mockGetSimilar(...args),
  },
}));

const mockEmit = vi.fn().mockResolvedValue(undefined);

vi.mock('../services/event-bus.service', () => ({
  eventBus: {
    emit: (...args: unknown[]) => mockEmit(...args),
  },
}));

import { recommendationRoutes } from './recommendations';

describe('Recommendation Routes', () => {
  let app: Hono;
  let authedApp: Hono;

  const mockUser = { id: 'user-1', tenantId: 'tenant-1', email: 'test@test.com', displayName: 'Test', role: 'user' };

  beforeEach(() => {
    vi.clearAllMocks();

    // App with authenticated user
    authedApp = new Hono();
    authedApp.use('*', async (c, next) => {
      c.set('user', mockUser);
      c.set('tenantId', 'tenant-1');
      await next();
    });
    authedApp.route('/recommendations', recommendationRoutes);

    // App without authenticated user (public access)
    app = new Hono();
    app.route('/recommendations', recommendationRoutes);
  });

  // ── GET / (personalized, auth required) ──

  describe('GET /recommendations', () => {
    const mockItems = [
      { characterId: 'ch-1', score: 0.95, source: 'collaborative' },
      { characterId: 'ch-2', score: 0.80, source: 'trending' },
    ];

    it('should return personalized recommendations for authenticated user', async () => {
      mockGetPersonalized.mockResolvedValue(mockItems);
      const res = await authedApp.request('/recommendations');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.items).toEqual(mockItems);
      expect(body.meta.timestamp).toBeDefined();
      expect(mockGetPersonalized).toHaveBeenCalledWith('user-1', 20);
    });

    it('should accept custom limit parameter', async () => {
      mockGetPersonalized.mockResolvedValue([]);
      const res = await authedApp.request('/recommendations?limit=5');
      expect(res.status).toBe(200);
      expect(mockGetPersonalized).toHaveBeenCalledWith('user-1', 5);
    });
    it('should reject invalid limit', async () => {
      const res = await authedApp.request('/recommendations?limit=0');
      expect(res.status).toBe(400);
    });

    it('should reject limit exceeding max', async () => {
      const res = await authedApp.request('/recommendations?limit=101');
      expect(res.status).toBe(400);
    });

    it('should return 401 for unauthenticated user', async () => {
      const res = await app.request('/recommendations');
      expect(res.status).toBe(401);
    });
  });

  // ── GET /trending (public) ──

  describe('GET /recommendations/trending', () => {
    const mockTrending = [
      { characterId: 'ch-3', score: 100, source: 'trending' },
      { characterId: 'ch-4', score: 85, source: 'trending' },
    ];

    it('should return trending characters without auth', async () => {
      mockGetTrending.mockResolvedValue(mockTrending);
      const res = await app.request('/recommendations/trending');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.items).toEqual(mockTrending);
      expect(body.meta.timestamp).toBeDefined();
      expect(mockGetTrending).toHaveBeenCalledWith(20);
    });

    it('should accept custom limit parameter', async () => {
      mockGetTrending.mockResolvedValue([]);
      const res = await app.request('/recommendations/trending?limit=10');
      expect(res.status).toBe(200);
      expect(mockGetTrending).toHaveBeenCalledWith(10);
    });

    it('should reject invalid limit', async () => {
      const res = await app.request('/recommendations/trending?limit=0');
      expect(res.status).toBe(400);
    });
  });
  // ── GET /similar/:characterId (public) ──

  describe('GET /recommendations/similar/:characterId', () => {
    const mockSimilar = [
      { characterId: 'ch-5', score: 0.75, source: 'content-based' },
      { characterId: 'ch-6', score: 0.60, source: 'content-based' },
    ];

    it('should return similar characters without auth', async () => {
      mockGetSimilar.mockResolvedValue(mockSimilar);
      const res = await app.request('/recommendations/similar/ch-1');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.items).toEqual(mockSimilar);
      expect(body.meta.timestamp).toBeDefined();
      expect(mockGetSimilar).toHaveBeenCalledWith('ch-1', 20);
    });

    it('should accept custom limit parameter', async () => {
      mockGetSimilar.mockResolvedValue([]);
      const res = await app.request('/recommendations/similar/ch-1?limit=5');
      expect(res.status).toBe(200);
      expect(mockGetSimilar).toHaveBeenCalledWith('ch-1', 5);
    });

    it('should reject invalid limit', async () => {
      const res = await app.request('/recommendations/similar/ch-1?limit=0');
      expect(res.status).toBe(400);
    });
  });

  // ── POST /feedback (auth required) ──

  describe('POST /recommendations/feedback', () => {
    it('should emit recommendation.feedback event', async () => {
      const res = await authedApp.request('/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: 'ch-1',
          action: 'click',
          position: 3,
          experimentId: 'exp-abc',
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.received).toBe(true);
      expect(mockEmit).toHaveBeenCalledWith('recommendation.feedback', expect.objectContaining({
        userId: 'user-1',
        characterId: 'ch-1',
        action: 'click',
        position: 3,
        experimentId: 'exp-abc',
      }));
    });

    it('should accept feedback without optional fields', async () => {
      const res = await authedApp.request('/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: 'ch-2',
          action: 'dismiss',
        }),
      });
      expect(res.status).toBe(200);
      expect(mockEmit).toHaveBeenCalledWith('recommendation.feedback', expect.objectContaining({
        userId: 'user-1',
        characterId: 'ch-2',
        action: 'dismiss',
      }));
    });

    it('should reject invalid action', async () => {
      const res = await authedApp.request('/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: 'ch-1',
          action: 'invalid_action',
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject missing characterId', async () => {
      const res = await authedApp.request('/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'click',
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should return 401 for unauthenticated user', async () => {
      const res = await app.request('/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: 'ch-1',
          action: 'click',
        }),
      });
      expect(res.status).toBe(401);
    });
  });

  // ── Error handling ──

  describe('Error handling', () => {
    it('should propagate service errors as 500', async () => {
      mockGetPersonalized.mockRejectedValue(new Error('Redis connection failed'));
      const res = await authedApp.request('/recommendations');
      expect(res.status).toBe(500);
    });
  });
});
