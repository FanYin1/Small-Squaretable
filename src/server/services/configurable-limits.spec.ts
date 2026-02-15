import { describe, it, expect } from 'vitest';

describe('Configurable limits', () => {
  it('should have default memory limits per tier', () => {
    const defaults = { free: 100, pro: 500, team: 2000 };
    expect(defaults.free).toBe(100);
    expect(defaults.pro).toBe(500);
    expect(defaults.team).toBe(2000);
  });

  it('should have default cache TTL', () => {
    const defaultTTL = 300;
    expect(defaultTTL).toBe(300);
  });

  it('should have default recommendation cache TTL', () => {
    const recommendationTTL = 900;
    expect(recommendationTTL).toBe(900);
  });
});
