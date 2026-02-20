import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockDisconnect = vi.fn().mockResolvedValue(undefined);
const mockProducer = { connect: mockConnect, disconnect: mockDisconnect };
const mockConsumerConnect = vi.fn().mockResolvedValue(undefined);
const mockConsumer = { connect: mockConsumerConnect };

vi.mock('kafkajs', () => {
  const KafkaMock = vi.fn(function (this: Record<string, unknown>) {
    this.producer = vi.fn().mockReturnValue(mockProducer);
    this.consumer = vi.fn().mockReturnValue(mockConsumer);
  });
  return { Kafka: KafkaMock };
});

vi.mock('./config', () => ({
  config: {
    kafkaClientId: 'test-client',
    kafkaBrokers: 'localhost:9092,localhost:9093',
  },
}));

describe('kafka', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset module state between tests by re-importing
    vi.resetModules();
  });

  it('should create and connect a producer on first call', async () => {
    const { getKafkaProducer } = await import('./kafka');
    const producer = await getKafkaProducer();
    expect(producer).toBe(mockProducer);
    expect(mockConnect).toHaveBeenCalledOnce();
  });

  it('should reuse the same producer on subsequent calls (singleton)', async () => {
    const { getKafkaProducer } = await import('./kafka');
    const producer1 = await getKafkaProducer();
    const producer2 = await getKafkaProducer();
    expect(producer1).toBe(producer2);
    expect(mockConnect).toHaveBeenCalledOnce();
  });

  it('should create a consumer with the given group id', async () => {
    const { Kafka } = await import('kafkajs');
    const { createKafkaConsumer } = await import('./kafka');
    const consumer = await createKafkaConsumer('test-group');
    expect(consumer).toBe(mockConsumer);
    expect(mockConsumerConnect).toHaveBeenCalledOnce();
  });

  it('should disconnect producer on closeKafka', async () => {
    const { getKafkaProducer, closeKafka } = await import('./kafka');
    await getKafkaProducer();
    await closeKafka();
    expect(mockDisconnect).toHaveBeenCalledOnce();
  });

  it('should handle closeKafka when no producer exists', async () => {
    const { closeKafka } = await import('./kafka');
    // Should not throw
    await expect(closeKafka()).resolves.toBeUndefined();
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('should export correct TOPICS constants', async () => {
    const { TOPICS } = await import('./kafka');
    expect(TOPICS).toEqual({
      USER: 'events.user',
      CHAT: 'events.chat',
      CHARACTER: 'events.character',
      RECOMMENDATION: 'events.recommendation',
      SYSTEM: 'events.system',
    });
  });

  it('should initialize Kafka with config values', async () => {
    const { Kafka } = await import('kafkajs');
    await import('./kafka');
    expect(Kafka).toHaveBeenCalledWith({
      clientId: 'test-client',
      brokers: ['localhost:9092', 'localhost:9093'],
    });
  });
});
