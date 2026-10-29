import { describe, expect, it } from 'vitest';
import { isStandaloneWorldbook, prepareStandaloneWorldbook } from './worldbook-import';

describe('Standalone world book normalization', () => {
  it('maps aliases, explicit extension options and disabled entries through the shared entry contract', () => {
    const result = prepareStandaloneWorldbook({ name: 'Knowledge', description: 'Context', entries: {
      10: { key: ['late'], keysecondary: ['other'], content: 'Later', order: 20, disable: true, selective: false },
      2: { keys: ['early'], content: 'Earlier', insertion_order: 4, position: 2, depth: 1,
        extensions: { position: 4, depth: 8, role: 2, probability: 0, selectiveLogic: 3 }, preventRecursion: true },
    } });
    expect(result.description).toBe('Context');
    expect(result.entries[0]).toMatchObject({ keyword: 'early', position: 4, priority: 8, preventRecursion: true,
      settings: { position: 'atDepth', depth: 8, role: 2, probability: 0, selectiveLogic: 'NOT_ALL' } });
    expect(result.entries[1]).toMatchObject({ keyword: 'late', position: 20, isEnabled: false, settings: { keysSecondary: [] } });
  });

  it.each([null, [], { entries: 'wrong' }, { entries: [null] }, { entries: [{ keys: [7], content: 'x' }] }, { entries: [{ content: 1 }] }])('rejects the whole invalid book: %j', input => {
    expect(() => prepareStandaloneWorldbook(input)).toThrow();
  });

  it('keeps empty books explicit and does not classify cards as standalone books', () => {
    expect(prepareStandaloneWorldbook({ entries: [] }).entries).toEqual([]);
    expect(isStandaloneWorldbook({ entries: {}, name: 'book' })).toBe(true);
    expect(isStandaloneWorldbook({ entries: {}, spec: 'chara_card_v3', data: {} })).toBe(false);
  });

  it('maps unset timing fields consistently for standalone books', () => {
    const result = prepareStandaloneWorldbook({ entries: {
      0: { content: 'Unset extension timers', extensions: { sticky: null, cooldown: null, delay: null } },
      1: { content: 'Explicit timers', sticky: 4, cooldown: 2, delay: 1, extensions: { sticky: null, cooldown: null, delay: null } },
    } });
    expect(result.entries[0].settings).toMatchObject({ sticky: 0, cooldown: 0, delay: 0 });
    expect(result.entries[1].settings).toMatchObject({ sticky: 4, cooldown: 2, delay: 1 });
  });
});
