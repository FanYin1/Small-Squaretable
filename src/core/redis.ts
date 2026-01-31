import { createClient } from 'redis';
import { config } from './config';

let redisClient: ReturnType<typeof createClient> | null = null;
let connectionPromise: Promise<ReturnType<typeof createClient>> | null = null;

export async function getRedisClient() {
  if (!redisClient) {
    redisClient = createClient({
      url: config.redisUrl,
      password: config.redisPassword || undefined,
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    connectionPromise = redisClient.connect();
  }

  if (connectionPromise) {
    await connectionPromise;
    connectionPromise = null;
  }

  return redisClient;
}

export async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
