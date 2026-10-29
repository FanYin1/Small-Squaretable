import { describe, expect, it } from 'vitest';
import { changeWorldbookBindingSchema, diagnoseWorldbookDependencies, type CharacterWorldbookBinding } from './character-worldbook-bindings';

const book: CharacterWorldbookBinding = { id: 'book', name: 'Harbor lore', characterId: 'character', scope: 'character',
  isEnabled: true, entryCount: 2, enabledEntryCount: 1 };
const card = { extensions: { world: 'Harbor lore' } };

describe('worldbook dependency hints', () => {
  it('does not equate a library name match with an explicit binding', () => {
    expect(diagnoseWorldbookDependencies(card, 'character', [{ ...book, characterId: null }])[0].status).toBe('unbound');
    expect(diagnoseWorldbookDependencies(card, 'character', [{ ...book, characterId: 'other' }])[0].status).toBe('unbound');
    expect(diagnoseWorldbookDependencies(card, 'character', [{ ...book, scope: 'global' }])[0].status).toBe('unbound');
  });
  it('distinguishes active, disabled and empty bindings', () => {
    expect(diagnoseWorldbookDependencies(card, 'character', [book])[0].status).toBe('bound');
    expect(diagnoseWorldbookDependencies(card, 'character', [{ ...book, isEnabled: false }])[0].status).toBe('disabled');
    expect(diagnoseWorldbookDependencies(card, 'character', [{ ...book, enabledEntryCount: 0 }])[0].status).toBe('empty');
  });
  it('handles wrapped cards and multiple books without claiming undeclared dependencies', () => {
    expect(diagnoseWorldbookDependencies({ data: card }, 'character', [book])[0].status).toBe('bound');
    expect(diagnoseWorldbookDependencies(card, 'character', [{ ...book, id: 'duplicate' }, book])[0].status).toBe('ambiguous');
    expect(diagnoseWorldbookDependencies({ extensions: { other: 'Harbor lore' } }, 'character', [book])).toEqual([]);
    expect(diagnoseWorldbookDependencies(null, 'character', [book])).toEqual([]);
  });
  it('requires an explicit previous binding and rejects unknown operations', () => {
    expect(changeWorldbookBindingSchema.safeParse({ action: 'bind' }).success).toBe(false);
    expect(changeWorldbookBindingSchema.safeParse({ action: 'guess', expectedCharacterId: null }).success).toBe(false);
    expect(changeWorldbookBindingSchema.parse({ action: 'bind', expectedCharacterId: null })).toEqual({ action: 'bind', expectedCharacterId: null });
  });
  it('checks edited normalized fields rather than a stale nested copy', () => {
    expect(diagnoseWorldbookDependencies({ name: 'Edited', extensions: { world: 'Current' }, data: card }, 'character', [book]))
      .toEqual([{ name: 'Current', status: 'unbound' }]);
  });
});
