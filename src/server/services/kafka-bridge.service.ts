/**
 * Kafka Bridge Service
 *
 * Listens to EventBus wildcard events and forwards them to Kafka topics.
 */

import { randomUUID } from 'crypto';
import type { EventBus, WildcardHandler } from './event-bus.service';
import { getKafkaProducer, TOPICS } from '../../core/kafka';
import { logger } from './logger.service';

const kafkaLogger = logger.child({ module: 'kafka-bridge' });

const EVENT_ROUTE_MAP: Record<string, string> = {
  'chat.': TOPICS.CHAT,
  'character.': TOPICS.CHARACTER,
  'social.': TOPICS.USER,
  'user.': TOPICS.USER,
  'recommendation.': TOPICS.RECOMMENDATION,
};

export class KafkaBridgeService {
  constructor(private eventBus: EventBus) {}

  async start(): Promise<void> {
    this.eventBus.on('*', this.handleEvent.bind(this) as WildcardHandler);
    kafkaLogger.info('Kafka bridge started');
  }

  private async handleEvent(event: string, payload: Record<string, unknown>): Promise<void> {
    if (event.startsWith('webhook.') || event.startsWith('plugin.')) return;

    const topic = this.routeToTopic(event);

    try {
      const producer = await getKafkaProducer();
      const message = {
        eventId: randomUUID(),
        eventType: event,
        timestamp: Date.now(),
        properties: payload,
      };

      const key = this.extractKey(event, payload);

      await producer.send({
        topic,
        messages: [{ key, value: JSON.stringify(message) }],
      });
    } catch (error) {
      kafkaLogger.error(`Failed to send event "${event}"`, error as Error);
    }
  }

  private routeToTopic(event: string): string {
    for (const [prefix, topic] of Object.entries(EVENT_ROUTE_MAP)) {
      if (event.startsWith(prefix)) return topic;
    }
    return TOPICS.SYSTEM;
  }

  private extractKey(event: string, payload: Record<string, unknown>): string | undefined {
    if (payload.userId) return String(payload.userId);
    if (payload.chatId) return String(payload.chatId);
    if (payload.characterId) return String(payload.characterId);
    return undefined;
  }
}

import { eventBus } from './event-bus.service';
export const kafkaBridge = new KafkaBridgeService(eventBus);
