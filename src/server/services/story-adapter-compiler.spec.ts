import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { compileStoryAdapter, isCurrentStoryAdapter } from './story-adapter-compiler';
import { runAdapterGraph } from './story-adapter-workflow';
import { buildStoryEntryProfile, selectStoryOpening } from './story-entry.service';
import { adapterArtifactSchema, frozenStoryRules } from '../../types/story-adapter';
import { storyContentSnapshotSchema, type StoryContentSnapshot } from '../../types/story-content';
import type { StorySources } from './story-diagnostics.service';
import { availableStoryActions, applyStoryAction } from '../../types/story-state';

const rules = { version: 1, fields: [{ id: 'coins', label: '金币', type: 'number', initial: 10, min: 0 },
  { id: 'found', label: '已发现', type: 'boolean', initial: false }], actions: [
  { id: 'pay', label: '支付3枚', intent: 'act', requires: [{ field: 'coins', operator: 'gte', value: 3 }], changes: [{ field: 'coins', operation: 'add', value: -3 }], outcome: '支付3枚。' },
  { id: 'find', label: '调查', intent: 'observe', once: true, requires: [{ field: 'found', operator: 'eq', value: false }],
    changes: [{ field: 'found', operation: 'set', value: true }, { field: 'coins', operation: 'add', value: 2 }], outcome: '发现2枚。' },
] };
function fixture() {
  const id = randomUUID();
  const content: StoryContentSnapshot = { protocol: 1, revision: 'a'.repeat(64), capturedAt: '2026-10-27T00:00:00.000Z',
    characters: [{ id, name: '显式声明测试夹具', description: '作者介绍', avatarUrl: null, promptTemplate: null, cardData: { first_mes: '你站在港口。' } }] };
  const sources: StorySources = { characters: [], books: [{ id: randomUUID(), name: '规则', characterId: id, scope: 'character', isEnabled: true,
    entryCount: 1, enabledEntryCount: 1, entries: [{ content: `\u0060\u0060\u0060squaretable-rules-v1\n${JSON.stringify(rules)}\n\u0060\u0060\u0060`, isEnabled: true, settings: { constant: true } }] }] };
  return { content, sources, jobId: randomUUID(), revision: 'b'.repeat(64) };
}
function compile(input = fixture()) { return compileStoryAdapter(input.content, input.sources, input.jobId, input.revision); }

describe('source-bound finite adapter, synthetic fixtures are not real-card acceptance', () => {
  it.each([
    undefined, {}, { constant: false }, { constant: 'true' },
    { constant: true, probability: 50 }, { constant: true, probability: 0 },
    { constant: true, probability: '100' }, { constant: true, delay: 1 },
    { constant: true, cooldown: 2 }, { constant: true, sticky: 3 },
  ])('does not turn gated or uncertain source settings %j into unconditional rules', settings => {
    const input = fixture();
    input.sources.books[0].entries[0].settings = settings;
    expect(compile(input)).toMatchObject({ conclusion: 'review', reason: 'conditional-source' });
    expect(compile(input).rules).toBeUndefined();
  });
  it('accepts unconditional declarations without turning keywords on constant entries into gates', () => {
    const input = fixture();
    input.sources.books[0].entries[0].settings = { constant: true, probability: 100, delay: 0, cooldown: 0, sticky: 0, keys: ['金币'], keysSecondary: ['港口'] };
    expect(compile(input).conclusion).toBe('supported');
  });
  it.each([{ characterFilter: ['another-character'] }, { characterFilter: 'invalid-filter' }, { characterFilter: [1] }])('rejects incompatible character filters %j', ({ characterFilter }) => {
    const input = fixture();
    Object.assign(input.sources.books[0].entries[0], { characterFilter });
    expect(compile(input).reason).toBe('conditional-source');
  });
  it('accepts a filter that includes the single selected character', () => {
    const input = fixture();
    Object.assign(input.sources.books[0].entries[0], { characterFilter: [input.content.characters[0].id] });
    expect(compile(input).conclusion).toBe('supported');
  });
  it('rechecks supported receipts without modifying the receipt or frozen rules', () => {
    const input = fixture();
    const artifact = compile(input);
    const saved = JSON.stringify(artifact);
    expect(isCurrentStoryAdapter(artifact, input.content, input.sources)).toBe(true);
    input.sources.books[0].entries[0].settings = { constant: true, probability: 50 };
    expect(isCurrentStoryAdapter(artifact, input.content, input.sources)).toBe(false);
    expect(JSON.stringify(artifact)).toBe(saved);
    const frozen = adapterArtifactSchema.parse(JSON.parse(saved));
    expect(frozenStoryRules({ cardData: {}, adaptation: frozen })).toEqual(artifact.rules);
    expect(applyStoryAction(frozen.rules!, frozen.rules!.actions[0], { coins: 10, found: false }).coins).toBe(7);
  });
  it('uses only enabled, character-bound sources', () => {
    for (const kind of ['disabled-book', 'disabled-entry', 'foreign-character', 'global']) {
      const input = fixture();
      if (kind === 'disabled-book') input.sources.books[0].isEnabled = false;
      if (kind === 'disabled-entry') input.sources.books[0].entries[0].isEnabled = false;
      if (kind === 'foreign-character') input.sources.books[0].characterId = randomUUID();
      if (kind === 'global') input.sources.books[0].scope = 'global';
      expect(compile(input)).toMatchObject({ conclusion: 'unsupported', reason: 'no-declaration' });
    }
  });
  it('freezes provenance and runs set/add/conditions/once through the existing engine', () => {
    const artifact = compile();
    expect(artifact.sources).toHaveLength(1);
    expect(artifact.sources[0].digest).toMatch(/^[a-f0-9]{64}$/);
    const compiled = artifact.rules!;
    let values = { coins: 10, found: false };
    const find = availableStoryActions(compiled, values, []).find(action => action.id === 'find')!;
    values = applyStoryAction(compiled, find, values) as typeof values;
    expect(values).toEqual({ coins: 12, found: true });
    expect(availableStoryActions(compiled, values, ['find']).map(action => action.id)).toEqual(['pay']);
    expect(availableStoryActions(compiled, { coins: 2, found: true }, ['find'])).toEqual([]);
    expect(() => applyStoryAction(compiled, compiled.actions[0], { coins: 2, found: true })).toThrow();
  });
  it('refuses ambiguous declarations, invalid types, formulas and maps', () => {
    const ambiguous = fixture();
    ambiguous.sources.books[0].entries.push(...structuredClone(ambiguous.sources.books[0].entries));
    expect(compile(ambiguous).reason).toBe('multiple-declarations');
    for (const value of [{ ...rules, map: { locationField: 'found', nodes: [] } },
      { ...rules, fields: [{ id: 'coins', label: '金币', type: 'number', initial: '10+2' }] },
      { ...rules, formula: 'eval(1)' }, { ...rules, actions: [] }]) {
      const input = fixture();
      input.sources.books[0].entries[0].content = `\u0060\u0060\u0060squaretable-rules-v1\n${JSON.stringify(value)}\n\u0060\u0060\u0060`;
      expect(compile(input)).toMatchObject({ conclusion: 'invalid', reason: 'invalid-declaration' });
      expect(compile(input).rules).toBeUndefined();
    }
  });
  it('does not adopt declarations alongside external controls or native rules', () => {
    const input = fixture();
    input.content.characters[0].cardData.alternate_greetings = ['<VariableInsert>{"coins":999}</VariableInsert>另一个开场'];
    expect(compile(input).reason).toBe('external-mechanisms');
    const native = fixture();
    native.content.characters[0].cardData.extensions = { squaretable: { exploration: rules } };
    expect(compile(native).reason).toBe('native-conflict');
    native.sources.books = [];
    expect(compile(native)).toMatchObject({ conclusion: 'native' });
    expect(compile(native).rules).toBeUndefined();
  });
  it('refuses partial scans and never infers a transaction from prose', () => {
    const input = fixture();
    input.sources.books[0].entries[0].content = '初始10金币，支付3金币升级；需掷骰和装备表。';
    expect(compile(input).conclusion).toBe('unsupported');
    input.sources.books[0].entries[0].content = 'x'.repeat(2_000_001);
    expect(compile(input).reason).toBe('source-limit');
  });
  it('keeps original card and introduction; freezes adapted rules without overwriting extensions', () => {
    const input = fixture();
    const original = JSON.stringify(input.content.characters[0].cardData);
    input.content.characters[0].adaptation = compile(input);
    const profile = buildStoryEntryProfile(input.content, input.sources);
    expect(profile).toMatchObject({ rulesStatus: 'adapted', description: { text: '作者介绍' } });
    expect(profile.initialFields[0].value).toBe(10);
    selectStoryOpening(input.content, input.sources, { characterId: profile.characterId, revision: profile.revision, reference: { source: 'first_mes', index: 0 }, reviewed: false });
    expect(input.content.characters[0].adaptationReport?.runtime).toBe('adapted');
    expect(JSON.stringify(input.content.characters[0].cardData)).toBe(original);
    const frozen = storyContentSnapshotSchema.parse(JSON.parse(JSON.stringify(input.content)));
    expect(frozenStoryRules(frozen.characters[0])?.fields[0].initial).toBe(10);
    frozen.characters[0].adaptation!.characterId = randomUUID();
    expect(storyContentSnapshotSchema.safeParse(frozen).success).toBe(false);
  });
  it('rejects contradictory artifacts', () => {
    const artifact = compile();
    expect(adapterArtifactSchema.safeParse({ ...artifact, conclusion: 'unsupported' }).success).toBe(false);
    expect(adapterArtifactSchema.safeParse({ ...artifact, sources: [] }).success).toBe(false);
  });
  it('orchestrates real graph nodes and stops before compilation when a checkpoint loses its lease', async () => {
    const input = fixture();
    const stages: string[] = [];
    const result = await runAdapterGraph({ jobId: input.jobId, sourceRevision: input.revision,
      collect: async () => input, checkpoint: async stage => { stages.push(stage); } });
    expect(stages).toEqual(['collect', 'inspect', 'compile']);
    expect(result.conclusion).toBe('supported');
    await expect(runAdapterGraph({ jobId: input.jobId, sourceRevision: input.revision,
      collect: async () => input, checkpoint: async stage => { if (stage === 'inspect') throw new Error('lease lost'); } })).rejects.toThrow('lease lost');
  });
});
