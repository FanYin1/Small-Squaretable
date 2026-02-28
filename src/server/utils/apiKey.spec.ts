import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, getKeyHint } from './apiKey';

describe('API Key Utilities', () => {
  describe('generateApiKey', () => {
    it('returns string starting with sq_test_', () => {
      const key = generateApiKey();
      expect(key.startsWith('sq_test_')).toBe(true);
    });

    it('returns 40-char string', () => {
      const key = generateApiKey();
      expect(key.length).toBe(40); // 8 prefix + 32 hex
    });

    it('returns unique values on each call', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('hashApiKey', () => {
    it('returns 64-char hex string', () => {
      const hash = hashApiKey('sq_test_test1234567890abcdef12345678');
      expect(hash.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });

    it('returns same hash for same input', () => {
      const key = 'sq_test_test1234567890abcdef12345678';
      expect(hashApiKey(key)).toBe(hashApiKey(key));
    });
  });

  describe('getKeyHint', () => {
    it('returns prefix + last 4 chars', () => {
      const hint = getKeyHint('sq_test_abcdef1234567890abcdef12345678');
      expect(hint).toBe('sq_test_...5678');
    });
  });
});
