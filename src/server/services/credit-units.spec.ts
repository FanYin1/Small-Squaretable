import { describe, it, expect, vi } from 'vitest';

vi.mock('../../core/config', () => ({
  config: { creditTokensPerPoint: 10000 },
}));

import { pointsToTokens, tokensToPoints, getTokensPerPoint, POINT_DECIMALS } from './credit-units';

describe('credit-units', () => {
  it('reads the rate from config', () => {
    expect(getTokensPerPoint()).toBe(10000);
    expect(POINT_DECIMALS).toBe(4);
  });

  describe('pointsToTokens', () => {
    it('converts points to integer tokens', () => {
      expect(pointsToTokens(1)).toBe(10000);
      expect(pointsToTokens(0.62)).toBe(6200);
      expect(pointsToTokens(2.5)).toBe(25000);
    });

    it('rounds sub-token precision to the nearest token', () => {
      // 不足 0.5 token 会四舍五入成 0，按非法金额处理
      expect(pointsToTokens(0.00004)).toBeNull();
      expect(pointsToTokens(0.00006)).toBe(1);
      expect(pointsToTokens(0.12345)).toBe(1235);
    });

    it('rejects zero, negative and non-finite amounts', () => {
      expect(pointsToTokens(0)).toBeNull();
      expect(pointsToTokens(-1)).toBeNull();
      expect(pointsToTokens(Number.NaN)).toBeNull();
      expect(pointsToTokens(Number.POSITIVE_INFINITY)).toBeNull();
    });

    it('rejects amounts that overflow a safe integer', () => {
      expect(pointsToTokens(Number.MAX_SAFE_INTEGER)).toBeNull();
    });

    it('honours an explicit rate', () => {
      expect(pointsToTokens(3, 1000)).toBe(3000);
    });
  });

  describe('tokensToPoints', () => {
    it('converts tokens to points with 4 decimals', () => {
      expect(tokensToPoints(6200)).toBe(0.62);
      expect(tokensToPoints(1)).toBe(0.0001);
      expect(tokensToPoints(0)).toBe(0);
    });

    it('strips floating point noise', () => {
      expect(tokensToPoints(3)).toBe(0.0003);
      expect(tokensToPoints(70000)).toBe(7);
    });

    it('round-trips with pointsToTokens for whole tokens', () => {
      for (const tokens of [1, 7, 6200, 12345, 999999]) {
        expect(pointsToTokens(tokensToPoints(tokens))).toBe(tokens);
      }
    });
  });
});
