import { describe, expect, it } from 'vitest';
import { buildStoryEntryProfile, selectStoryOpening } from './story-entry.service';
import type { StoryContentSnapshot } from '../../types/story-content';
import type { StorySources } from './story-diagnostics.service';

const characterId = '00000000-0000-4000-8000-000000000001';
const sources: StorySources = { characters: [], books: [] };
function snapshot(): StoryContentSnapshot {
  return { protocol: 1, revision: 'b'.repeat(64), capturedAt: '2026-10-26T00:00:00.000Z', characters: [{
    id: characterId, name: 'Story', description: null, avatarUrl: null, promptTemplate: null,
    cardData: { first_mes: 'First', alternate_greetings: [null, 'Second {{user}}', 'Balance {{getvar::cash}}'] },
  }] };
}

describe('story entry preparation and selection', () => {
  it('rejects native rules mixed with external initialization without partially saving a choice', () => {
    const content = snapshot();
    content.characters[0].cardData = { first_mes: '<VariableInsert>{"balance":1000}</VariableInsert>A quiet morning.',
      extensions: { squaretable: { exploration: { version: 1, fields: [], actions: [] } } } };
    const profile = buildStoryEntryProfile(content, sources);
    expect(profile.openings[0].record?.status).toBe('conflict');
    expect(() => selectStoryOpening(content, sources, { characterId, revision: profile.revision, reference: { source: 'first_mes', index: 0 }, reviewed: false })).toThrow('尚未核对');
    expect(content.characters[0].opening).toBeUndefined();
    expect(content.characters[0].openingRecord).toBeUndefined();
  });
  it('freezes the exact selected source and changes the state revision without rewriting the card', () => {
    const content = snapshot();
    const original = JSON.stringify(content.characters[0].cardData);
    const profile = buildStoryEntryProfile(content, sources);
    const selection = { characterId, revision: profile.revision, reference: { source: 'alternate_greetings' as const, index: 1 }, reviewed: false };
    expect(selectStoryOpening(content, sources, selection)).toBe('Second {{user}}');
    expect(content.characters[0].opening).toEqual(selection);
    expect(content.revision).not.toBe('b'.repeat(64));
    expect(JSON.stringify(content.characters[0].cardData)).toBe(original);
  });

  it('rejects a stale version even when the chosen opening text did not change', () => {
    const content = snapshot();
    const profile = buildStoryEntryProfile(content, sources);
    content.characters[0].description = 'Changed';
    expect(() => selectStoryOpening(content, sources, { characterId, revision: profile.revision, reference: { source: 'first_mes', index: 0 }, reviewed: false }))
      .toThrow('已经更新');
    expect(content.characters[0].opening).toBeUndefined();
  });

  it('rejects source holes, out-of-range choices, a different character and skipping valid openings', () => {
    for (const reference of [{ source: 'alternate_greetings' as const, index: 0 }, { source: 'alternate_greetings' as const, index: 999 }, { source: 'none' as const, index: 0 }]) {
      const content = snapshot();
      expect(() => selectStoryOpening(content, sources, { characterId, revision: buildStoryEntryProfile(content, sources).revision, reference, reviewed: true })).toThrow();
    }
    const content = snapshot();
    expect(() => selectStoryOpening(content, sources, { characterId: 'other', revision: buildStoryEntryProfile(content, sources).revision, reference: { source: 'first_mes', index: 0 }, reviewed: false })).toThrow('不属于');
  });

  it('requires acknowledgment for unadapted macros and allows explicit no-opening only without usable text', () => {
    const content = snapshot();
    const selection = { characterId, revision: buildStoryEntryProfile(content, sources).revision, reference: { source: 'alternate_greetings' as const, index: 2 }, reviewed: false };
    expect(() => selectStoryOpening(content, sources, selection)).toThrow('尚未确认');
    expect(selectStoryOpening(content, sources, { ...selection, reviewed: true })).toBe('Balance {{getvar::cash}}');
    const empty = snapshot();
    empty.characters[0].cardData = { first_mes: '<VariableInsert>init</VariableInsert>' };
    expect(selectStoryOpening(empty, sources, { characterId, revision: buildStoryEntryProfile(empty, sources).revision, reference: { source: 'none', index: 0 }, reviewed: true })).toBeNull();
  });

  it('does not invent state fields from narration, assets or secret hints', () => {
    const content = snapshot();
    content.characters[0].cardData.first_mes = 'You may earn 1000 coins later.';
    expect(buildStoryEntryProfile(content, sources)).toMatchObject({ initialFields: [], rulesStatus: 'unadapted' });
  });

  it('exposes only declared visible initial fields and keeps unknown values null', () => {
    const content = snapshot();
    content.characters[0].cardData.extensions = { squaretable: { exploration: { version: 1, fields: [
      { id: 'coins', label: 'Coins', type: 'number', initial: 12 },
      { id: 'unknown', label: 'Unknown', type: 'number', initial: null },
      { id: 'secret', label: 'Secret', type: 'boolean', initial: false, visible: false },
      { id: 'discovered', label: 'Discovered', type: 'string', initial: 'Hidden', visibleWhen: [{ field: 'secret', operator: 'eq', value: true }] },
    ] } } };
    const profile = buildStoryEntryProfile(content, sources);
    expect(profile.rulesStatus).toBe('native');
    expect(profile.initialFields).toEqual([{ id: 'coins', label: 'Coins', value: 12 }, { id: 'unknown', label: 'Unknown', value: null }]);
    selectStoryOpening(content, sources, { characterId, revision: profile.revision, reference: { source: 'alternate_greetings', index: 1 }, reviewed: false });
    expect(buildStoryEntryProfile(content, sources).initialFields).toEqual(profile.initialFields);
  });

  it('reports invalid native rules without substituting fabricated defaults', () => {
    const content = snapshot();
    content.characters[0].cardData.extensions = { squaretable: { exploration: { version: 1,
      fields: [{ id: 'coins', label: 'Coins', type: 'number', initial: 'invalid' }] } } };
    expect(buildStoryEntryProfile(content, sources)).toMatchObject({ initialFields: [], rulesStatus: 'invalid' });
  });
});
