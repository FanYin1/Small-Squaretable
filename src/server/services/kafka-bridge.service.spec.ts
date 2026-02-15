/**
 * KafkaBridgeService unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from './event-bus.service';

// ── Hoisted mocks (available before vi.mock hoisting) ──
const { mockSend, mockProducer, mockKafkaLoggerError } = vi.hoisted(() => {
  const mockSend = vi.fn().mockResolvedValue(undefined);
  const mockProducer = { send: mockSend };
  const mockKafkaLoggerError = vi.fn();
  return { mockSend, mockProducer, mockKafkaLoggerError };
});

vi.mock('../../core/kafka', () => ({
  getKafkaProducer: vi.fn().mockResolvedValue(mockProducer),
  TOPICS: {
    USER: 'events.user',
    CHAT: 'events.chat',
    CHARACTER: 'events.character',
    RECOMMENDATION: 'events.recommendation',
    SYSTEM: 'events.system',
  },
}));

// Mock crypto.randomUUID for deterministic eventId
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return {
    ...actual,
    randomUUID: vi.fn().mockReturnValue('test-uuid-1234'),
  };
});

vi.mock('./logger.service', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: mockKafkaLoggerError,
    }),
  },
}));

import { KafkaBridgeService } from './kafka-bridge.service';

describe('KafkaBridgeService', () => {
  let bridge: KafkaBridgeService;
  let eventBus: EventBus;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = new EventBus();
    bridge = new KafkaBridgeService(eventBus);
  });

  // ── 1. start() registers wildcard listener ──
  describe('start()', () => {
    it('should register a wildcard listener on EventBus', async () => {
      expect(eventBus.listenerCount('*')).toBe(0);
      await bridge.start();
      expect(eventBus.listenerCount('*')).toBe(1);
    });
  });

  // ── 2. User events route to events.user topic ──
  describe('event routing', () => {
    it('should route social.follow events to events.user topic', async () => {
      await bridge.start();
      const payload = { userId: 'user-1', targetUserId: 'user-2' };
      await eventBus.emit('social.follow', payload);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith({
        topic: 'events.user',
        messages: [
          {
            key: 'user-1',
            value: expect.stringContaining('"eventType":"social.follow"'),
          },
        ],
      });
    });

    it('should route user.* events to events.user topic', async () => {
      await bridge.start();
      const payload = { userId: 'user-1' };
      await eventBus.emit('user.subscription.changed', payload);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith({
        topic: 'events.user',
        messages: [
          {
            key: 'user-1',
            value: expect.stringContaining('"eventType":"user.subscription.changed"'),
          },
        ],
      });
    });

    // ── 3. Chat events route to events.chat topic ──
    it('should route chat.message.sent events to events.chat topic', async () => {
      await bridge.start();
      const payload = { chatId: 'chat-1', content: 'hello' };
      await eventBus.emit('chat.message.sent', payload);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith({
        topic: 'events.chat',
        messages: [
          {
            key: 'chat-1',
            value: expect.stringContaining('"eventType":"chat.message.sent"'),
          },
        ],
      });
    });

    // ── 4. Character events route to events.character topic ──
    it('should route character.created events to events.character topic', async () => {
      await bridge.start();
      const payload = { characterId: 'char-1', name: 'Test Character' };
      await eventBus.emit('character.created', payload);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith({
        topic: 'events.character',
        messages: [
          {
            key: 'char-1',
            value: expect.stringContaining('"eventType":"character.created"'),
          },
        ],
      });
    });

    // ── 5. Recommendation events route to events.recommendation topic ──
    it('should route recommendation.* events to events.recommendation topic', async () => {
      await bridge.start();
      const payload = { userId: 'user-1' };
      await eventBus.emit('recommendation.generated', payload);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith({
        topic: 'events.recommendation',
        messages: [
          {
            key: 'user-1',
            value: expect.stringContaining('"eventType":"recommendation.generated"'),
          },
        ],
      });
    });

    // ── 6. Unknown events route to events.system topic ──
    it('should route unknown events to events.system topic', async () => {
      await bridge.start();
      const payload = { data: 'test' };
      await eventBus.emit('unknown.event', payload);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith({
        topic: 'events.system',
        messages: [
          {
            key: undefined,
            value: expect.stringContaining('"eventType":"unknown.event"'),
          },
        ],
      });
    });
  });

  // ── 7. webhook.* events are skipped ──
  describe('event filtering', () => {
    it('should skip webhook.* events (not sent to Kafka)', async () => {
      await bridge.start();
      await eventBus.emit('webhook.delivered', { endpointId: 'ep-1' });
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should skip plugin.* events (not sent to Kafka)', async () => {
      await bridge.start();
      await eventBus.emit('plugin.executed', { pluginId: 'p-1' });
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  // ── 8. Messages include BaseEvent fields ──
  describe('message format', () => {
    it('should include BaseEvent fields (eventId, eventType, timestamp, properties)', async () => {
      await bridge.start();
      const payload = { userId: 'user-1', action: 'test' };
      await eventBus.emit('social.follow', payload);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const sentValue = JSON.parse(mockSend.mock.calls[0][0].messages[0].value);
      expect(sentValue).toEqual({
        eventId: 'test-uuid-1234',
        eventType: 'social.follow',
        timestamp: expect.any(Number),
        properties: { userId: 'user-1', action: 'test' },
      });
    });
  });

  // ── 9. Key extraction ──
  describe('key extraction', () => {
    it('should use userId as key when present', async () => {
      await bridge.start();
      await eventBus.emit('social.follow', { userId: 'user-1' });
      expect(mockSend.mock.calls[0][0].messages[0].key).toBe('user-1');
    });

    it('should use chatId as key when userId is absent', async () => {
      await bridge.start();
      await eventBus.emit('chat.message.sent', { chatId: 'chat-1' });
      expect(mockSend.mock.calls[0][0].messages[0].key).toBe('chat-1');
    });

    it('should use characterId as key when userId and chatId are absent', async () => {
      await bridge.start();
      await eventBus.emit('character.created', { characterId: 'char-1' });
      expect(mockSend.mock.calls[0][0].messages[0].key).toBe('char-1');
    });

    it('should use undefined key when no identifiers are present', async () => {
      await bridge.start();
      await eventBus.emit('unknown.event', { data: 'test' });
      expect(mockSend.mock.calls[0][0].messages[0].key).toBeUndefined();
    });
  });

  // ── 10. Error handling ──
  describe('error handling', () => {
    it('should log error and not throw when producer.send fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Kafka unavailable'));

      await bridge.start();
      // Should not throw
      await eventBus.emit('social.follow', { userId: 'user-1' });

      expect(mockKafkaLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send event "social.follow"'),
        expect.any(Error),
      );
    });
  });
});
