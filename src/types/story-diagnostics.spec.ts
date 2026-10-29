import { describe, expect, it } from 'vitest';
import { inspectStoryDiagnostics, validateStoryIdentities, storyDiagnosticsSchema, type DiagnosticBook } from './story-diagnostics';
import { mapCharacterWorldbookEntry, characterWorldbookSchema } from './character-worldbook';
import { prepareStandaloneWorldbook } from './worldbook-import';
import { storyCharacterPreview } from './story-content';

const book: DiagnosticBook = { id: 'book', name: 'PRIVATE_REFERENCE', characterId: 'card', scope: 'character',
  isEnabled: true, entryCount: 1, enabledEntryCount: 1, entries: [{ content: 'PRIVATE <UpdateVariable>', isEnabled: true, settings: { squaretablePurpose: 'knowledge' } }] };
const card = { name: 'A', extensions: { world: book.name } };
const fixed = (name: string) => ({ name: 'Card', extensions: { squaretable: { playerIdentity: { protocol: 1, fixedName: name } } } });

describe('source-backed compatibility diagnostics', () => {
  it('reports actual bindings and declared purposes without hidden contents or names', () => {
    const result = inspectStoryDiagnostics(card, 'card', [book]);
    expect(result.books).toEqual({ bound: 1, active: 1, disabled: 0, empty: 0, dependencies: ['bound'], purposes: ['knowledge'], undeclaredPurpose: false });
    expect(result.capabilities.issues).toContain('variable_framework');
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(storyDiagnosticsSchema.parse(result)).toEqual(result);
  });
  it.each([
    [{ ...book, characterId: 'other' }, 'unbound'],
    [{ ...book, scope: 'global' }, 'unbound'],
    [{ ...book, isEnabled: false }, 'disabled'],
    [{ ...book, enabledEntryCount: 0, entries: [] }, 'empty'],
  ] as const)('does not treat inactive, empty or unrelated bindings as ready', (sample, status) => {
    const result = inspectStoryDiagnostics(card, 'card', [{ ...sample, entries: [...sample.entries] }]);
    expect(result.books.dependencies).toEqual([status]);
    expect(result.books.active).toBe(0);
    expect(result.capabilities.issues).not.toContain('variable_framework');
  });
  it('does not infer a purpose from a familiar name or count duplicate bindings as verified', () => {
    const result = inspectStoryDiagnostics(card, 'card', [book, { ...book, id: 'duplicate', entries: [{ content: 'a whole world', isEnabled: true }] }]);
    expect(result.books.dependencies).toEqual(['ambiguous']);
    expect(result.books.undeclaredPurpose).toBe(true);
  });
  it('preserves explicit entry purposes through both import mappings', () => {
    const entry = { content: 'PRIVATE', extensions: { squaretable: { purpose: 'style' } } };
    const embedded = characterWorldbookSchema.parse({ entries: [entry] });
    expect(mapCharacterWorldbookEntry(embedded.entries[0]).settings).toMatchObject({ squaretablePurpose: 'style' });
    expect(prepareStandaloneWorldbook({ entries: [entry] }).entries[0].settings).toMatchObject({ squaretablePurpose: 'style' });
  });
  it('does not reinterpret author prose as an identity declaration', () => {
    expect(inspectStoryDiagnostics({ description: 'You must be named PRIVATE' }, 'card', []).identity.status).toBe('unverified');
    expect(validateStoryIdentities([{ cardData: card }], 'Any name')).toBeNull();
  });
  it('rejects explicit name conflicts and invalid declarations without mutating source cards', () => {
    const source = fixed('Alex');
    const before = JSON.stringify(source);
    expect(validateStoryIdentities([{ cardData: source }], 'Alex')).toBeNull();
    expect(validateStoryIdentities([{ cardData: source }], 'Other')).toBe('conflict');
    expect(validateStoryIdentities([{ cardData: source }, { cardData: fixed('Other') }], 'Alex')).toBe('conflict');
    expect(validateStoryIdentities([{ cardData: fixed('') }], 'Alex')).toBe('invalid');
    expect(JSON.stringify(source)).toBe(before);
  });
  it('returns the saved report even if a source card is edited later', () => {
    const diagnostics = inspectStoryDiagnostics(card, 'card', [book], true);
    const preview = storyCharacterPreview({ id: '10000000-0000-4000-8000-000000000001', name: 'A', description: null, avatarUrl: null, promptTemplate: null,
      cardData: { first_mes: 'Opening' }, diagnostics }, 0);
    expect(preview.diagnostics).toEqual(diagnostics);
    expect(preview.compatibility.issues).toContain('variable_framework');
    expect(preview.diagnostics?.multipleCharacters).toBe(true);
    expect(JSON.stringify(preview)).not.toContain('PRIVATE');
  });
});
