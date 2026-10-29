import { describe, expect, it } from 'vitest';
import { creditActivityQuerySchema, recordedCreditUsage } from './credit-activity';

describe('recorded credit usage', () => {
  it.each([null, [], {}, { inputTokens: 1 }, { inputTokens: 1, outputTokens: -1 }, { inputTokens: 1.5, outputTokens: 2 }, { inputTokens: '1', outputTokens: 2 }, { inputTokens: NaN, outputTokens: 2 }, { inputTokens: Infinity, outputTokens: 2 }, { inputTokens: Number.MAX_SAFE_INTEGER + 1, outputTokens: 2 }])('keeps incomplete/invalid usage unknown: %j', metadata => {
    expect(recordedCreditUsage(metadata)).toBeNull();
  });
  it('preserves real zero and strips unrelated metadata', () => {
    expect(recordedCreditUsage({ inputTokens: 0, outputTokens: 0, private: 'hidden' })).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

describe('bounded UTC-equivalent ranges', () => {
  it('supports explicit offsets and compares actual instants', () => {
    expect(creditActivityQuerySchema.safeParse({ from: '2026-10-01T08:00:00+08:00', to: '2026-10-01T00:00:01Z' }).success).toBe(true);
    expect(creditActivityQuerySchema.safeParse({ from: '2026-10-01T08:00:00+08:00', to: '2026-10-01T00:00:00Z' }).success).toBe(false);
  });
  it('allows exactly 366 days, rejects reversed or longer ranges', () => {
    const from = '2024-01-01T00:00:00Z';
    expect(creditActivityQuerySchema.safeParse({ from, to: '2025-01-01T00:00:00Z' }).success).toBe(true);
    expect(creditActivityQuerySchema.safeParse({ from, to: '2025-01-01T00:00:00.001Z' }).success).toBe(false);
    expect(creditActivityQuerySchema.safeParse({ from, to: '2023-12-31T23:59:59Z' }).success).toBe(false);
  });
});
