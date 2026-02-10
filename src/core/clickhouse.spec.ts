import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPing = vi.fn().mockResolvedValue({ success: true });
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockQuery = vi.fn().mockResolvedValue({ rows: [] });

vi.mock('@clickhouse/client', () => ({
  createClient: vi.fn().mockImplementation(() => ({
    ping: mockPing,
    close: mockClose,
    query: mockQuery,
  })),
}));

vi.mock('./config', () => ({
  config: {
    clickhouseUrl: 'http://localhost:8123',
    clickhouseDatabase: 'analytics',
  },
}));

describe('clickhouse', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should create a client on first call', async () => {
    const { createClient } = await import('@clickhouse/client');
    const { getClickHouseClient } = await import('./clickhouse');
    const client = getClickHouseClient();
    expect(client).toBeDefined();
    expect(createClient).toHaveBeenCalledWith({
      url: 'http://localhost:8123',
      database: 'analytics',
    });
  });

  it('should return the same client on subsequent calls (singleton)', async () => {
    const { createClient } = await import('@clickhouse/client');
    const { getClickHouseClient } = await import('./clickhouse');
    const client1 = getClickHouseClient();
    const client2 = getClickHouseClient();
    expect(client1).toBe(client2);
    expect(createClient).toHaveBeenCalledOnce();
  });

  it('should support ping', async () => {
    const { getClickHouseClient } = await import('./clickhouse');
    const client = getClickHouseClient();
    const result = await client.ping();
    expect(result).toEqual({ success: true });
    expect(mockPing).toHaveBeenCalledOnce();
  });

  it('should close the client and reset singleton on closeClickHouse', async () => {
    const { createClient } = await import('@clickhouse/client');
    const { getClickHouseClient, closeClickHouse } = await import('./clickhouse');
    getClickHouseClient();
    await closeClickHouse();
    expect(mockClose).toHaveBeenCalledOnce();

    // After close, getting client again should create a new one
    getClickHouseClient();
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it('should handle closeClickHouse when no client exists', async () => {
    const { closeClickHouse } = await import('./clickhouse');
    // Should not throw
    await expect(closeClickHouse()).resolves.toBeUndefined();
    expect(mockClose).not.toHaveBeenCalled();
  });
});
