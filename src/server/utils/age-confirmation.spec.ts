import { describe, it, expect } from 'vitest';
import { ageConfirmationFields } from './age-confirmation';
import { hashIp } from './ip-hash';

describe('hashIp', () => {
  it('is a stable 16-char hex digest, not the raw IP', () => {
    const h = hashIp('203.0.113.7');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(h).toBe(hashIp('203.0.113.7'));
    expect(h).not.toBe(hashIp('203.0.113.8'));
  });
});

describe('ageConfirmationFields', () => {
  it('records the time and the hashed IP', () => {
    const before = Date.now();
    const fields = ageConfirmationFields('203.0.113.7');

    expect(fields.ageConfirmedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(fields.ageConfirmedIp).toBe(hashIp('203.0.113.7'));
  });

  it('stores null when the IP is unknown', () => {
    expect(ageConfirmationFields(undefined).ageConfirmedIp).toBeNull();
    expect(ageConfirmationFields('').ageConfirmedIp).toBeNull();
  });
});
