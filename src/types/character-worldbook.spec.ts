import { describe, expect, it } from 'vitest';
import { characterWorldbookSchema, mapCharacterWorldbookEntry } from './character-worldbook';

describe('embedded character world books', () => {
  it('keeps original unknown settings while mapping extension precedence', () => {
    const book = characterWorldbookSchema.parse({
      entries: [{ keys: ['gate'], content: 'A locked gate.', enabled: false,
        position: 'after_char', depth: 2, insertion_order: 31, case_sensitive: true,
        extensions: { position: 4, depth: 7, role: 1, case_sensitive: null,
          match_whole_words: null, exclude_recursion: true, author_panel: 'preserve' } }],
      author_settings: { mode: 'custom' },
    });
    expect(book.author_settings).toEqual({ mode: 'custom' });
    expect(book.entries[0].extensions?.author_panel).toBe('preserve');
    expect(mapCharacterWorldbookEntry(book.entries[0])).toMatchObject({
      keyword: 'gate', isEnabled: false, priority: 7, position: 31,
      settings: { position: 'atDepth', depth: 7, role: 1, caseSensitive: true,
        matchWholeWords: false, excludeRecursion: true },
    });
  });

  it('does not require secondary keys when selective matching is disabled', () => {
    const book = characterWorldbookSchema.parse({ entries: [{ keys: ['gate'],
      secondary_keys: ['key'], selective: false, content: 'A gate.', extensions: { selectiveLogic: 1 } }] });
    expect(mapCharacterWorldbookEntry(book.entries[0]).settings.keysSecondary).toEqual([]);
    expect(book.entries[0].secondary_keys).toEqual(['key']);
  });

  it('maps enabled secondary logic from card extensions', () => {
    const book = characterWorldbookSchema.parse({ entries: [{ keys: ['gate'],
      secondary_keys: ['key'], selective: true, content: 'A gate.', extensions: { selectiveLogic: 2 } }] });
    expect(mapCharacterWorldbookEntry(book.entries[0]).settings).toMatchObject({
      keysSecondary: ['key'], selectiveLogic: 'NOT_ANY',
    });
  });

  it.each([{}, { entries: {} }, { entries: [null] }, { entries: [{ content: 42 }] },
    { entries: [{ content: 'Gate', keys: [42] }] }])('rejects malformed embedded books: %j', value => {
    expect(characterWorldbookSchema.safeParse(value).success).toBe(false);
  });

  it('allows an explicitly empty world book', () => {
    expect(characterWorldbookSchema.parse({ entries: [] }).entries).toEqual([]);
  });

  it('accepts unset timing extensions from external cards without losing the original nulls', () => {
    const source = { entries: [{ content: 'Owned timing fixture', extensions: { sticky: null, cooldown: null, delay: null } }] };
    const book = characterWorldbookSchema.parse(source);
    expect(book.entries[0].extensions).toEqual(source.entries[0].extensions);
    expect(mapCharacterWorldbookEntry(book.entries[0]).settings).toMatchObject({ sticky: 0, cooldown: 0, delay: 0 });
  });

  it('does not let unset timing extensions override explicitly configured entry values', () => {
    const book = characterWorldbookSchema.parse({ entries: [{ content: 'Owned timing fixture', sticky: 3, cooldown: 2, delay: 1,
      extensions: { sticky: null, cooldown: null, delay: null } }] });
    expect(mapCharacterWorldbookEntry(book.entries[0]).settings).toMatchObject({ sticky: 3, cooldown: 2, delay: 1 });
    const unset = characterWorldbookSchema.parse({ entries: [{ content: 'Owned timing fixture', sticky: null, cooldown: null, delay: null }] });
    expect(mapCharacterWorldbookEntry(unset.entries[0]).settings).toMatchObject({ sticky: 0, cooldown: 0, delay: 0 });
  });

  it.each([-1, 1.5, '3', false, {}])('still rejects invalid timer values %j', value => {
    for (const field of ['sticky', 'cooldown', 'delay']) {
      expect(characterWorldbookSchema.safeParse({ entries: [{ content: 'Owned timing fixture', [field]: value }] }).success).toBe(false);
      expect(characterWorldbookSchema.safeParse({ entries: [{ content: 'Owned timing fixture', extensions: { [field]: value } }] }).success).toBe(false);
    }
  });
});
