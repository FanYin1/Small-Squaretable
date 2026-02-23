import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// --- Mocks ---

const mockPing = vi.fn().mockResolvedValue('PONG');
const mockInfo = vi.fn().mockResolvedValue('used_memory_human:1.5M\r\n');

vi.mock('@/core/redis', () => ({
  getRedisClient: vi.fn().mockResolvedValue({
    ping: mockPing,
    info: mockInfo,
  }),
}));

const mockExecute = vi.fn().mockResolvedValue([{ '?column?': 1 }]);

vi.mock('@/db', () => ({
  db: {
    execute: mockExecute,
  },
}));

vi.mock('@/core/config', () => ({
  config: {
    nodeEnv: 'test',
    databasePoolMin: 2,
    databasePoolMax: 10,
    redisUrl: 'redis://localhost:6379',
    redisPassword: undefined,
  },
}));

describe('Health Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPing.mockResolvedValue('PONG');
    mockInfo.mockResolvedValue('used_memory_human:1.5M\r\n');
    mockExecute.mockResolvedValue([{ '?column?': 1 }]);
  });

  it('readinessCheck returns ok with redis latency when Redis is healthy', async () => {
    const { readinessCheck } = await import('./health');
    const result = await readinessCheck();

    expect(result.status).toBe('ok');
    expect(result.checks?.redis?.status).toBe('ok');
    expect(result.checks?.redis?.latency).toBeTypeOf('number');
    expect(result.checks?.redis?.details?.connected).toBe(true);
    expect(result.checks?.redis?.details?.memory_usage).toBe('1.5M');
    expect(result.checks?.database?.status).toBe('ok');
  });

  it('readinessCheck returns degraded when Redis ping fails', async () => {
    mockPing.mockRejectedValue(new Error('Connection refused'));

    const { readinessCheck } = await import('./health');
    const result = await readinessCheck();

    expect(result.status).toBe('degraded');
    expect(result.checks?.redis?.status).toBe('error');
    expect(result.checks?.redis?.error).toBe('Connection refused');
    expect(result.checks?.redis?.details?.connected).toBe(false);
    // DB should still be ok
    expect(result.checks?.database?.status).toBe('ok');
  });

  it('readinessCheck returns error when DB fails', async () => {
    mockExecute.mockRejectedValue(new Error('ECONNREFUSED'));

    const { readinessCheck } = await import('./health');
    const result = await readinessCheck();

    expect(result.status).toBe('error');
    expect(result.checks?.database?.status).toBe('error');
    expect(result.checks?.database?.error).toBe('ECONNREFUSED');
  });

  it('does NOT import createClient from redis', () => {
    const healthPath = path.resolve(__dirname, 'health.ts');
    const source = fs.readFileSync(healthPath, 'utf-8');
    expect(source).not.toMatch(/import\s+.*createClient.*from\s+['"]redis['"]/);
  });
});
