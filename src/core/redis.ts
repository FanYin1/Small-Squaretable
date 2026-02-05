import { createClient, type RedisClientType } from 'redis';
import { config } from './config';

let redisClient: RedisClientType | null = null;
let connectionPromise: Promise<RedisClientType> | null = null;

export async function getRedisClient() {
  if (!redisClient) {
    redisClient = createClient({
      url: config.redisUrl,
      password: config.redisPassword || undefined,
    }) as RedisClientType;

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

// Export a promise-based redis client for convenience
export const redis = {
  async get(key: string): Promise<string | null> {
    const client = await getRedisClient();
    return await client.get(key);
  },
  async set(key: string, value: string, options?: { EX?: number }): Promise<string | null> {
    const client = await getRedisClient();
    if (options?.EX) {
      return await client.set(key, value, { EX: options.EX });
    }
    return await client.set(key, value);
  },
  async del(key: string): Promise<number> {
    const client = await getRedisClient();
    return await client.del(key);
  },
  async keys(pattern: string): Promise<string[]> {
    const client = await getRedisClient();
    return await client.keys(pattern);
  },
};
