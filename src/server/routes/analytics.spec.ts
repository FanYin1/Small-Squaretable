import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { analyticsRoutes } from './analytics';

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

describe('Analytics Routes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', { id: 'user-1', tenantId: 'tenant-1' });
      c.set('tenantId', 'tenant-1');
      await next();
    });
    app.route('/analytics', analyticsRoutes);
  });

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
});
