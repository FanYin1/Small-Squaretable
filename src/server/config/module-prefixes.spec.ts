import { describe, it, expect } from 'vitest';
import { moduleOwnedPrefixes, isPrefixClosed } from './module-prefixes';
import { csrfProtectedPrefixes } from './csrf-paths';
import { MODULE_NAMES } from '../../types/modules';

describe('module-prefixes', () => {
  it('only maps prefixes that are CSRF protected prefixes', () => {
    for (const prefix of Object.keys(moduleOwnedPrefixes)) {
      expect(csrfProtectedPrefixes as readonly string[]).toContain(prefix);
    }
  });

  it('only maps to known module names', () => {
    for (const name of Object.values(moduleOwnedPrefixes)) {
      expect(MODULE_NAMES).toContain(name);
    }
  });

  it('treats a prefix as closed when its module is off', () => {
    expect(isPrefixClosed('/api/v1/plugins', () => false)).toBe(true);
    expect(isPrefixClosed('/api/v1/plugins', (n) => n === 'plugins')).toBe(false);
  });

  it('never closes prefixes without an owner module', () => {
    expect(isPrefixClosed('/api/v1/characters', () => false)).toBe(false);
    expect(isPrefixClosed('/api/v1/social', () => false)).toBe(false);
  });
});
