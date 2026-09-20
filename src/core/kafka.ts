import { Kafka, type Producer, type Consumer } from 'kafkajs';
import { config } from './config';

const kafka = new Kafka({
  clientId: config.kafkaClientId,
  brokers: config.kafkaBrokers.split(','),
});

let producer: Producer | null = null;
let producerFailed = false;

export async function getKafkaProducer(): Promise<Producer | null> {
  if (producerFailed) return null;
  if (producer) return producer;

  try {
    producer = kafka.producer();
    await producer.connect();
    return producer;
  } catch {
    producerFailed = true;
    producer = null;
    return null;
  }
}

export async function createKafkaConsumer(groupId: string): Promise<Consumer> {
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  return consumer;
}

export async function closeKafka(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
  }
}

export const TOPICS = {
  USER: 'events.user',
  CHAT: 'events.chat',
  CHARACTER: 'events.character',
  RECOMMENDATION: 'events.recommendation',
  SYSTEM: 'events.system',
} as const;
