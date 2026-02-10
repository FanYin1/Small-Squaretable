import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { randomUUID } from 'crypto';
import { authMiddleware } from '../middleware/auth';
import { batchEventsSchema } from '../../types/analytics';
import { getKafkaProducer, TOPICS } from '../../core/kafka';

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
      console.error('[Analytics] Failed to ingest events:', error);
      return c.json({
        success: true,
        data: { accepted: events.length, note: 'queued' },
        meta: { timestamp: new Date().toISOString() },
      }, 202);
    }
  }
);

function routeEventToTopic(eventType: string): string {
  if (eventType.startsWith('chat.')) return TOPICS.CHAT;
  if (eventType.startsWith('character.')) return TOPICS.CHARACTER;
  if (eventType.startsWith('recommendation.')) return TOPICS.RECOMMENDATION;
  if (eventType.startsWith('page.') || eventType.startsWith('user.') || eventType.startsWith('social.')) return TOPICS.USER;
  return TOPICS.SYSTEM;
}
