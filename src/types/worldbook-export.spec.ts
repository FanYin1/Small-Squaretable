import { describe, expect, it } from 'vitest';
import { prepareStandaloneWorldbook } from './worldbook-import';
import { exportWorldbookEntry } from './worldbook-export';

describe('Worldbook authoring round trip', () => {
  it.each([0, 1, 2, 3, 4, 5, 6])('preserves injection position %i independently from ordering', position => {
    const source = { entries: [{ keys: ['harbor', 'port'], secondary_keys: ['rain'], content: 'Reference', position,
      insertion_order: 175, depth: 9, selectiveLogic: 3, constant: true, enabled: false, probability: 0,
      sticky: 2, cooldown: 3, delay: 4, case_sensitive: true, match_whole_words: true,
      recursive: false, prevent_recursion: true, exclude_recursion: true,
      extensions: { role: 2, squaretable: { purpose: 'knowledge' } } }] };
    const imported = prepareStandaloneWorldbook(source).entries[0];
    const exported = exportWorldbookEntry(imported);
    expect(exported).toMatchObject({ position, insertion_order: 175, prevent_recursion: true, recursive: false });
    expect(prepareStandaloneWorldbook({ entries: [exported] }).entries[0]).toEqual(imported);
  });

  it.each(['setting', 'knowledge', 'style', 'rules', 'foreign-purpose'])('retains purpose %s without guessing', purpose => {
    const entry = prepareStandaloneWorldbook({ entries: [{ content: 'reference', extensions: { squaretable: { purpose } } }] }).entries[0];
    expect(prepareStandaloneWorldbook({ entries: [exportWorldbookEntry(entry)] }).entries[0].settings.squaretablePurpose).toBe(purpose);
  });

  it('keeps undeclared purpose and legacy numeric selection logic', () => {
    const exported = exportWorldbookEntry({ keyword: 'port, rain', content: 'reference', position: 95, isEnabled: true,
      settings: { selectiveLogic: 2, position: 'EMTop', order: 0 } });
    expect(exported).toMatchObject({ keys: ['port', 'rain'], position: 5, insertion_order: 95, selectiveLogic: 2 });
    expect(exported.extensions).not.toHaveProperty('squaretable');
  });
});
