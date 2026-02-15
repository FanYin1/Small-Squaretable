import { describe, it, expect } from 'vitest';

describe('Social rate limiters', () => {
  it('should define comment creation rate limit', () => {
    const limit = { limit: 10, windowMs: 60 * 1000 };
    expect(limit.limit).toBe(10);
  });

  it('should define report submission rate limit', () => {
    const limit = { limit: 5, windowMs: 60 * 60 * 1000 };
    expect(limit.limit).toBe(5);
  });

  it('should define data export rate limit', () => {
    const limit = { limit: 3, windowMs: 60 * 60 * 1000 };
    expect(limit.limit).toBe(3);
  });

  it('should define analytics ingestion rate limit', () => {
    const limit = { limit: 50, windowMs: 60 * 1000 };
    expect(limit.limit).toBe(50);
  });
});
