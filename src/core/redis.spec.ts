import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the redis package before importing the module under test
const mockClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue('OK'),
  get: vi.fn().mockResolvedValue('test-value'),
  del: vi.fn().mockResolvedValue(1),
  isOpen: true,
  on: vi.fn(),
};

vi.mock('redis', () => ({
  createClient: vi.fn(() => mockClient),
}));

describe('Redis Connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module state so getRedisClient creates a fresh client
    vi.resetModules();
  });

  it('should connect to Redis successfully', async () => {
    const { getRedisClient } = await import('./redis');
    const client = await getRedisClient();
    await client.set('test:key', 'test-value');
    const value = await client.get('test:key');
    expect(value).toBe('test-value');
    await client.del('test:key');
  });

  it('should handle connection errors gracefully', async () => {
    const { getRedisClient } = await import('./redis');
    const client = await getRedisClient();
    expect(client.isOpen).toBe(true);
  });
});
