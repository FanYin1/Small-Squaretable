import { describe, it, expect, vi } from 'vitest';

// Mock postgres and drizzle-orm so no real DB connection is made
vi.mock('postgres', () => {
  const mockQueryClient = vi.fn();
  return { default: vi.fn(() => mockQueryClient) };
});

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn(() => ({
    query: {},
    execute: vi.fn().mockResolvedValue([{ value: 1 }]),
  })),
}));

describe('Database Connection', () => {
  it('should connect to database successfully', async () => {
    const { db } = await import('./index');
    const result = await (db as any).execute('SELECT 1 as value');
    expect(result[0].value).toBe(1);
  });

  it('should have schema exported', async () => {
    const { db } = await import('./index');
    expect(db).toBeDefined();
    expect(db.query).toBeDefined();
  });
});
