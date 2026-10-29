import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MODULE_NAMES,
  DEFAULT_MODULE_FLAGS,
  resolveModuleFlags,
} from '../types/modules';
import { getModuleFlags, isModuleEnabled, resetModuleFlagsForTest } from './modules';

describe('resolveModuleFlags', () => {
  it('defaults every group to closed', () => {
    const flags = resolveModuleFlags({});
    for (const name of MODULE_NAMES) {
      expect(flags[name]).toBe(false);
    }
    expect(flags).toEqual(DEFAULT_MODULE_FLAGS);
  });

  it('enables only the listed groups', () => {
    const flags = resolveModuleFlags({ MODULES_ENABLED: 'analytics, plugins' });
    expect(flags.analytics).toBe(true);
    expect(flags.plugins).toBe(true);
    expect(flags.social_follow).toBe(false);
  });

  it('lets MODULES_DISABLED win over MODULES_ENABLED', () => {
    const flags = resolveModuleFlags({
      MODULES_ENABLED: 'analytics,plugins',
      MODULES_DISABLED: 'plugins',
    });
    expect(flags.analytics).toBe(true);
    expect(flags.plugins).toBe(false);
  });

  it('ignores empty entries', () => {
    const flags = resolveModuleFlags({ MODULES_ENABLED: ' , analytics,, ' });
    expect(flags.analytics).toBe(true);
  });

  it('throws on unknown module names', () => {
    expect(() => resolveModuleFlags({ MODULES_ENABLED: 'analytcs' })).toThrow(/analytcs/);
    expect(() => resolveModuleFlags({ MODULES_DISABLED: 'nope' })).toThrow(/nope/);
  });

  it('does not mutate the defaults', () => {
    resolveModuleFlags({ MODULES_ENABLED: 'analytics' });
    expect(DEFAULT_MODULE_FLAGS.analytics).toBe(false);
  });
});

describe('module runtime singleton', () => {
  const saved = {
    enabled: process.env.MODULES_ENABLED,
    disabled: process.env.MODULES_DISABLED,
  };

  beforeEach(() => {
    delete process.env.MODULES_ENABLED;
    delete process.env.MODULES_DISABLED;
    resetModuleFlagsForTest();
  });

  afterEach(() => {
    if (saved.enabled === undefined) delete process.env.MODULES_ENABLED;
    else process.env.MODULES_ENABLED = saved.enabled;
    if (saved.disabled === undefined) delete process.env.MODULES_DISABLED;
    else process.env.MODULES_DISABLED = saved.disabled;
    resetModuleFlagsForTest();
  });

  it('reads env on first use and caches the result', () => {
    process.env.MODULES_ENABLED = 'recommendations';
    expect(isModuleEnabled('recommendations')).toBe(true);
    process.env.MODULES_ENABLED = '';
    expect(isModuleEnabled('recommendations')).toBe(true);
    resetModuleFlagsForTest();
    expect(isModuleEnabled('recommendations')).toBe(false);
  });

  it('returns a copy so callers cannot mutate the cache', () => {
    const flags = getModuleFlags();
    flags.analytics = true;
    expect(isModuleEnabled('analytics')).toBe(false);
  });
});
