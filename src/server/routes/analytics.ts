import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import { randomUUID } from 'crypto';
import { authMiddleware } from '../middleware/auth';
import { logger } from '../services/logger.service';

const analyticsLogger = logger.child({ module: 'analytics' });
import { requireFeature } from '../middleware/feature-gate';
import { batchEventsSchema } from '../../types/analytics';
import { getKafkaProducer, TOPICS } from '../../core/kafka';
import { analyticsQueryService } from '../services/analytics-query.service';
import { subscriptionRepository } from '../../db/repositories/subscription.repository';

/**
 * Pro-plan analytics access endpoints (overview + realtime only).
 * Team-plan gets full access to all analytics endpoints.
 */
const PRO_ALLOWED_ENDPOINTS = new Set(['overview', 'realtime']);

function requireAnalyticsAccess(endpoint: string) {
  return createMiddleware(async (c: Context, next) => {
    const tenantId = c.get('tenantId');
    const subscription = await subscriptionRepository.findByTenantId(tenantId);
    const plan = subscription?.plan || 'free';

    if (plan === 'team') {
      return next();
    }

    if (plan === 'pro' && PRO_ALLOWED_ENDPOINTS.has(endpoint)) {
      return next();
    }

    return c.json(
      {
        error: 'Upgrade required',
        message: 'This analytics endpoint requires a Team plan',
        currentPlan: plan,
      },
      403
    );
  });
}

export const analyticsRoutes = new Hono();

analyticsRoutes.post(
  '/events',
  authMiddleware(),
  zValidator('json', batchEventsSchema),
  async (c) => {
    const user = c.get('user');
    const tenantId = c.get('tenantId');
    const { events, context } = c.req.valid('json');

    try {
      const producer = await getKafkaProducer();
      const messages = events.map((event) => {
        const topic = routeEventToTopic(event.eventType);
        return {
          topic,
          messages: [{
            key: user.id,
            value: JSON.stringify({
              eventId: randomUUID(),
              eventType: event.eventType,
              userId: user.id,
              tenantId,
              sessionId: context.sessionId,
              timestamp: event.timestamp || Date.now(),
              properties: event.properties,
              context: {
                platform: context.platform,
                deviceType: context.deviceType,
                browser: context.browser,
                os: context.os,
                appVersion: context.appVersion,
                referrer: context.referrer,
                utmSource: context.utmSource,
                utmMedium: context.utmMedium,
                utmCampaign: context.utmCampaign,
              },
            }),
          }],
        };
      });

      await producer.sendBatch({ topicMessages: messages });

      return c.json({
        success: true,
        data: { accepted: events.length },
        meta: { timestamp: new Date().toISOString() },
      }, 202);
    } catch (error) {
      analyticsLogger.error('Failed to ingest analytics events to Kafka', error as Error);
      return c.json({
        success: false,
        error: { code: 'INGESTION_FAILED', message: 'Failed to queue events' },
        meta: { timestamp: new Date().toISOString() },
      }, 500);
    }
  }
);

// ── Dashboard GET endpoints ──

analyticsRoutes.get(
  '/overview',
  authMiddleware(),
  requireFeature('analytics_dashboard'),
  requireAnalyticsAccess('overview'),
  zValidator('query', z.object({ weeks: z.coerce.number().int().min(1).max(52).optional().default(12) })),
  async (c) => {
    const tenantId = c.get('tenantId');
    const { weeks } = c.req.valid('query');

    const metrics = await analyticsQueryService.getNorthStarMetrics(tenantId, weeks);

    return c.json({
      success: true,
      data: { metrics },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

analyticsRoutes.get(
  '/retention',
  authMiddleware(),
  requireFeature('analytics_dashboard'),
  requireAnalyticsAccess('retention'),
  zValidator('query', z.object({ cohortWeeks: z.coerce.number().int().min(1).max(24).optional().default(8) })),
  async (c) => {
    const tenantId = c.get('tenantId');
    const { cohortWeeks } = c.req.valid('query');

    const matrix = await analyticsQueryService.getRetentionMatrix(tenantId, cohortWeeks);

    return c.json({
      success: true,
      data: { matrix },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

analyticsRoutes.get(
  '/funnel',
  authMiddleware(),
  requireFeature('analytics_dashboard'),
  requireAnalyticsAccess('funnel'),
  zValidator('query', z.object({ days: z.coerce.number().int().min(1).max(90).optional().default(30) })),
  async (c) => {
    const tenantId = c.get('tenantId');
    const { days } = c.req.valid('query');

    const steps = await analyticsQueryService.getConversionFunnel(tenantId, days);

    return c.json({
      success: true,
      data: { steps },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

analyticsRoutes.get(
  '/realtime',
  authMiddleware(),
  requireFeature('analytics_dashboard'),
  requireAnalyticsAccess('realtime'),
  async (c) => {
    const tenantId = c.get('tenantId');

    const metrics = await analyticsQueryService.getRealtimeMetrics(tenantId);

    return c.json({
      success: true,
      data: metrics,
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

analyticsRoutes.get(
  '/characters/top',
  authMiddleware(),
  requireFeature('analytics_dashboard'),
  requireAnalyticsAccess('characters/top'),
  zValidator('query', z.object({ limit: z.coerce.number().int().min(1).max(100).optional().default(20) })),
  async (c) => {
    const tenantId = c.get('tenantId');
    const { limit } = c.req.valid('query');

    const characters = await analyticsQueryService.getTopCharacters(tenantId, limit);

    return c.json({
      success: true,
      data: { characters },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

analyticsRoutes.get(
  '/segments',
  authMiddleware(),
  requireFeature('analytics_dashboard'),
  requireAnalyticsAccess('segments'),
  async (c) => {
    const tenantId = c.get('tenantId');

    const segments = await analyticsQueryService.getUserSegments(tenantId);

    return c.json({
      success: true,
      data: { segments },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

function routeEventToTopic(eventType: string): string {
  if (eventType.startsWith('chat.')) return TOPICS.CHAT;
  if (eventType.startsWith('character.')) return TOPICS.CHARACTER;
  if (eventType.startsWith('recommendation.')) return TOPICS.RECOMMENDATION;
  if (eventType.startsWith('page.') || eventType.startsWith('user.') || eventType.startsWith('social.')) return TOPICS.USER;
  return TOPICS.SYSTEM;
}
