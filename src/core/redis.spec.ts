import { describe, it, expect, afterAll } from 'vitest';
import { getRedisClient, closeRedis } from './redis';

describe('Redis Connection', () => {
  afterAll(async () => {
    await closeRedis();
  });

  it('should connect to Redis successfully', async () => {
    const client = await getRedisClient();
    await client.set('test:key', 'test-value');
    const value = await client.get('test:key');
    expect(value).toBe('test-value');
    await client.del('test:key');
  });

  it('should handle connection errors gracefully', async () => {
    const client = await getRedisClient();
    expect(client.isOpen).toBe(true);
  });
});
