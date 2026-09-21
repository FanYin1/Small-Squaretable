import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';

vi.mock('../../core/kafka', () => ({
  getKafkaProducer: vi.fn().mockResolvedValue({
    send: vi.fn().mockResolvedValue(undefined),
    sendBatch: vi.fn().mockResolvedValue(undefined),
  }),
  TOPICS: {
    USER: 'events.user',
    CHAT: 'events.chat',
    CHARACTER: 'events.character',
    RECOMMENDATION: 'events.recommendation',
    SYSTEM: 'events.system',
  },
}));

vi.mock('../middleware/auth', () => ({
  authMiddleware: () =>
    createMiddleware(async (_c, next) => {
      await next();
    }),
}));

vi.mock('../middleware/feature-gate', () => ({
  requireFeature: () =>
    createMiddleware(async (_c, next) => {
      await next();
    }),
}));

const mockGetNorthStarMetrics = vi.fn();
const mockGetRetentionMatrix = vi.fn();
const mockGetConversionFunnel = vi.fn();
const mockGetTopCharacters = vi.fn();
const mockGetRealtimeMetrics = vi.fn();
const mockGetUserSegments = vi.fn();

vi.mock('../services/analytics-query.service', () => ({
  analyticsQueryService: {
    getNorthStarMetrics: (...args: unknown[]) => mockGetNorthStarMetrics(...args),
    getRetentionMatrix: (...args: unknown[]) => mockGetRetentionMatrix(...args),
    getConversionFunnel: (...args: unknown[]) => mockGetConversionFunnel(...args),
    getTopCharacters: (...args: unknown[]) => mockGetTopCharacters(...args),
    getRealtimeMetrics: (...args: unknown[]) => mockGetRealtimeMetrics(...args),
    getUserSegments: (...args: unknown[]) => mockGetUserSegments(...args),
  },
}));
const mockFindByTenantId = vi.fn();

vi.mock('../../db/repositories/subscription.repository', () => ({
  subscriptionRepository: {
    findByTenantId: (...args: unknown[]) => mockFindByTenantId(...args),
  },
}));

import { analyticsRoutes } from './analytics';

describe('Analytics Routes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: team plan (full access)
    mockFindByTenantId.mockResolvedValue({ plan: 'team', status: 'active', currentPeriodEnd: null });
    app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', { id: 'user-1', tenantId: 'tenant-1' });
      c.set('tenantId', 'tenant-1');
      await next();
    });
    app.route('/analytics', analyticsRoutes);
  });

  // ── Existing event ingestion tests ──

  it('POST /analytics/events should accept batch events', async () => {
    const res = await app.request('/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          { eventType: 'page.view', properties: { path: '/market' } },
          { eventType: 'character.viewed', properties: { characterId: 'ch1' } },
        ],
        context: {
          sessionId: 'sess-123',
          platform: 'web',
          deviceType: 'desktop',
        },
      }),
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.accepted).toBe(2);
  });

  it('POST /analytics/events should reject empty events', async () => {
    const res = await app.request('/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [],
        context: { sessionId: 'sess-123' },
      }),
    });
    expect(res.status).toBe(400);
  });
  // ── GET /analytics/overview ──

  describe('GET /analytics/overview', () => {
    const mockMetrics = [
      { week: '2026-02-03', tenant_id: 'tenant-1', weekly_active_users: 150, weekly_messages: 3200 },
      { week: '2026-01-27', tenant_id: 'tenant-1', weekly_active_users: 140, weekly_messages: 2900 },
    ];

    it('should return north star metrics with default weeks', async () => {
      mockGetNorthStarMetrics.mockResolvedValue(mockMetrics);
      const res = await app.request('/analytics/overview');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.metrics).toEqual(mockMetrics);
      expect(body.meta.timestamp).toBeDefined();
      expect(mockGetNorthStarMetrics).toHaveBeenCalledWith('tenant-1', 12);
    });

    it('should accept custom weeks parameter', async () => {
      mockGetNorthStarMetrics.mockResolvedValue([]);
      const res = await app.request('/analytics/overview?weeks=4');
      expect(res.status).toBe(200);
      expect(mockGetNorthStarMetrics).toHaveBeenCalledWith('tenant-1', 4);
    });

    it('should reject invalid weeks parameter', async () => {
      const res = await app.request('/analytics/overview?weeks=0');
      expect(res.status).toBe(400);
    });

    it('should reject weeks exceeding max', async () => {
      const res = await app.request('/analytics/overview?weeks=53');
      expect(res.status).toBe(400);
    });
  });

  // ── GET /analytics/retention ──

  describe('GET /analytics/retention', () => {
    const mockMatrix = [
      { cohort_week: '2026-01-27', week_offset: 0, users: 100 },
      { cohort_week: '2026-01-27', week_offset: 1, users: 60 },
    ];

    it('should return retention matrix with default cohortWeeks', async () => {
      mockGetRetentionMatrix.mockResolvedValue(mockMatrix);
      const res = await app.request('/analytics/retention');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.matrix).toEqual(mockMatrix);
      expect(mockGetRetentionMatrix).toHaveBeenCalledWith('tenant-1', 8);
    });

    it('should accept custom cohortWeeks parameter', async () => {
      mockGetRetentionMatrix.mockResolvedValue([]);
      const res = await app.request('/analytics/retention?cohortWeeks=4');
      expect(res.status).toBe(200);
      expect(mockGetRetentionMatrix).toHaveBeenCalledWith('tenant-1', 4);
    });

    it('should reject invalid cohortWeeks', async () => {
      const res = await app.request('/analytics/retention?cohortWeeks=0');
      expect(res.status).toBe(400);
    });
  });
  // ── GET /analytics/funnel ──

  describe('GET /analytics/funnel', () => {
    const mockSteps = [
      { step: 'visit', users: 1000 },
      { step: 'signup', users: 300 },
      { step: 'first_chat', users: 150 },
      { step: 'subscription', users: 50 },
    ];

    it('should return conversion funnel with default days', async () => {
      mockGetConversionFunnel.mockResolvedValue(mockSteps);
      const res = await app.request('/analytics/funnel');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.steps).toEqual(mockSteps);
      expect(mockGetConversionFunnel).toHaveBeenCalledWith('tenant-1', 30);
    });

    it('should accept custom days parameter', async () => {
      mockGetConversionFunnel.mockResolvedValue([]);
      const res = await app.request('/analytics/funnel?days=7');
      expect(res.status).toBe(200);
      expect(mockGetConversionFunnel).toHaveBeenCalledWith('tenant-1', 7);
    });

    it('should reject days exceeding max', async () => {
      const res = await app.request('/analytics/funnel?days=91');
      expect(res.status).toBe(400);
    });
  });

  // ── GET /analytics/realtime ──

  describe('GET /analytics/realtime', () => {
    const mockRealtime = {
      activeUsers: 42,
      eventsPerMin: 120,
      messagesPerMin: 35,
    };

    it('should return realtime metrics', async () => {
      mockGetRealtimeMetrics.mockResolvedValue(mockRealtime);
      const res = await app.request('/analytics/realtime');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockRealtime);
      expect(mockGetRealtimeMetrics).toHaveBeenCalledWith('tenant-1');
    });
  });
  // ── GET /analytics/characters/top ──

  describe('GET /analytics/characters/top', () => {
    const mockCharacters = [
      { character_id: 'ch-1', total_messages: 500, total_chat_starts: 80, avg_rating: 4.5 },
      { character_id: 'ch-2', total_messages: 350, total_chat_starts: 60, avg_rating: 4.2 },
    ];

    it('should return top characters with default limit', async () => {
      mockGetTopCharacters.mockResolvedValue(mockCharacters);
      const res = await app.request('/analytics/characters/top');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.characters).toEqual(mockCharacters);
      expect(mockGetTopCharacters).toHaveBeenCalledWith('tenant-1', 20);
    });

    it('should accept custom limit parameter', async () => {
      mockGetTopCharacters.mockResolvedValue([]);
      const res = await app.request('/analytics/characters/top?limit=5');
      expect(res.status).toBe(200);
      expect(mockGetTopCharacters).toHaveBeenCalledWith('tenant-1', 5);
    });

    it('should reject limit exceeding max', async () => {
      const res = await app.request('/analytics/characters/top?limit=101');
      expect(res.status).toBe(400);
    });

    it('should reject limit of 0', async () => {
      const res = await app.request('/analytics/characters/top?limit=0');
      expect(res.status).toBe(400);
    });
  });

  // ── GET /analytics/segments ──

  describe('GET /analytics/segments', () => {
    const mockSegments = [
      { segment: 'power', user_count: 25 },
      { segment: 'active', user_count: 80 },
      { segment: 'casual', user_count: 200 },
      { segment: 'dormant', user_count: 50 },
    ];

    it('should return user segments', async () => {
      mockGetUserSegments.mockResolvedValue(mockSegments);
      const res = await app.request('/analytics/segments');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.segments).toEqual(mockSegments);
      expect(mockGetUserSegments).toHaveBeenCalledWith('tenant-1');
    });
  });
  // ── Plan-based access control (requireAnalyticsAccess) ──

  describe('Plan-based access control', () => {
    describe('Pro plan', () => {
      beforeEach(() => {
        mockFindByTenantId.mockResolvedValue({ plan: 'pro', status: 'active', currentPeriodEnd: null });
      });

      it('should allow GET /analytics/overview for pro plan', async () => {
        mockGetNorthStarMetrics.mockResolvedValue([]);
        const res = await app.request('/analytics/overview');
        expect(res.status).toBe(200);
      });

      it('should allow GET /analytics/realtime for pro plan', async () => {
        mockGetRealtimeMetrics.mockResolvedValue({ activeUsers: 0, eventsPerMin: 0, messagesPerMin: 0 });
        const res = await app.request('/analytics/realtime');
        expect(res.status).toBe(200);
      });

      it('should deny GET /analytics/retention for pro plan', async () => {
        const res = await app.request('/analytics/retention');
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).toBe('Upgrade required');
        expect(body.currentPlan).toBe('pro');
      });

      it('should deny GET /analytics/funnel for pro plan', async () => {
        const res = await app.request('/analytics/funnel');
        expect(res.status).toBe(403);
      });

      it('should deny GET /analytics/characters/top for pro plan', async () => {
        const res = await app.request('/analytics/characters/top');
        expect(res.status).toBe(403);
      });

      it('should deny GET /analytics/segments for pro plan', async () => {
        const res = await app.request('/analytics/segments');
        expect(res.status).toBe(403);
      });
    });

    describe('Team plan', () => {
      beforeEach(() => {
        mockFindByTenantId.mockResolvedValue({ plan: 'team', status: 'active', currentPeriodEnd: null });
      });

      it('should allow all endpoints for team plan', async () => {
        mockGetNorthStarMetrics.mockResolvedValue([]);
        mockGetRetentionMatrix.mockResolvedValue([]);
        mockGetConversionFunnel.mockResolvedValue([]);
        mockGetRealtimeMetrics.mockResolvedValue({ activeUsers: 0, eventsPerMin: 0, messagesPerMin: 0 });
        mockGetTopCharacters.mockResolvedValue([]);
        mockGetUserSegments.mockResolvedValue([]);

        const endpoints = [
          '/analytics/overview',
          '/analytics/retention',
          '/analytics/funnel',
          '/analytics/realtime',
          '/analytics/characters/top',
          '/analytics/segments',
        ];

        for (const endpoint of endpoints) {
          const res = await app.request(endpoint);
          expect(res.status).toBe(200);
        }
      });
    });

    describe('Free plan (no subscription)', () => {
      beforeEach(() => {
        mockFindByTenantId.mockResolvedValue(null);
      });

      it('should deny all analytics endpoints for free plan', async () => {
        const endpoints = [
          '/analytics/overview',
          '/analytics/retention',
          '/analytics/funnel',
          '/analytics/realtime',
          '/analytics/characters/top',
          '/analytics/segments',
        ];

        for (const endpoint of endpoints) {
          const res = await app.request(endpoint);
          expect(res.status).toBe(403);
        }
      });
    });
  });

  // ── Error handling ──

  describe('Error handling', () => {
    it('should propagate service errors as 500', async () => {
      mockGetNorthStarMetrics.mockRejectedValue(new Error('ClickHouse connection failed'));
      const res = await app.request('/analytics/overview');
      expect(res.status).toBe(500);
    });
  });
});
