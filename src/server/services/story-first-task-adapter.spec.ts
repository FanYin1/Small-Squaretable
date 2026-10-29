import { existsSync, readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseCharacterPng } from '../../types/character-card-import';
import { characterWorldbookSchema, mapCharacterWorldbookEntry } from '../../types/character-worldbook';
import { firstTaskRules, firstTaskScope, firstTaskSourceDigest } from '../../types/story-first-task';
import { adapterArtifactSchema, frozenStoryRules } from '../../types/story-adapter';
import { applyStoryAction, availableStoryActions, type StoryValues } from '../../types/story-state';
import { storyContentSnapshotSchema, type StoryContentSnapshot } from '../../types/story-content';
import { openingModeScope } from '../../types/story-opening-mode';
import type { StorySources } from './story-diagnostics.service';
import { compileStoryAdapter, isCurrentStoryAdapter } from './story-adapter-compiler';
import { buildStoryEntryProfile, selectStoryOpening } from './story-entry.service';
import { buildStoryTurnPrompt } from './story-turn-prompt';
import { prepareFirstTaskOpeningRecord } from './story-first-task-adapter';

const samplePath = process.env.FIRST_TASK_CARD_PATH ?? '/mnt/e/Download/26.1角色卡/25年全中文备注角色卡（7500➕）/7500+卡/2025-11-19/2025-11-19/未分类/大胃袋逆袭系统.png';

describe('reviewed first task contract', () => {
  it('records only the first task award once, without inventing a balance or using the generic one-point example', () => {
    const rules = firstTaskRules();
    const initial: StoryValues = Object.fromEntries(rules.fields.map(field => [field.id, field.initial]));
    const action = availableStoryActions(rules, initial, [])[0];
    expect(action.label).toContain('10分钟，中途不休息');
    expect(action.aliases).toEqual([]);
    expect(action.once).toBe(true);
    const completed = applyStoryAction(rules, action, initial);
    expect(completed).toEqual({ 'first-task-status': '已完成', 'first-task-earned': 2 });
    expect(availableStoryActions(rules, completed, [])).toEqual([]);
    expect(availableStoryActions(rules, initial, [action.id])).toEqual([]);
    expect(initial['first-task-earned']).toBe(0);
    expect(() => applyStoryAction(rules, action, completed)).toThrow();
    expect(rules.fields.map(field => field.label).join()).toContain('非总余额');
    expect(rules.map).toBeUndefined();
  });
  it('rejects forged rewards and proof, and provides the correct exclusions to narration', () => {
    const artifact = { version: 1, compiler: 'finite-rules-v1', jobId: randomUUID(), characterId: randomUUID(), sourceRevision: 'a'.repeat(64),
      conclusion: 'supported', reason: 'reviewed-first-task', rules: firstTaskRules(),
      sources: [{ bookId: randomUUID(), entryIndex: 1, digest: firstTaskSourceDigest }] };
    expect(adapterArtifactSchema.safeParse(artifact).success).toBe(true);
    for (const patch of [{ conclusion: 'unsupported' }, { sources: [] }, { turnEffect: 'kakaa-ritual-v1' },
      { sources: [{ ...artifact.sources[0], entryIndex: 5 }] }, { sources: [{ ...artifact.sources[0], digest: 'b'.repeat(64) }] },
      { rules: { ...artifact.rules, actions: artifact.rules.actions.map(action => ({ ...action, once: false })) } },
      { rules: { ...artifact.rules, fields: artifact.rules.fields.map(field => ({ ...field, initial: null })) } }]) {
      expect(adapterArtifactSchema.safeParse({ ...artifact, ...patch }).success).toBe(false);
    }
    const prompt = buildStoryTurnPrompt({ protocol: 1, legacy: false, native: true, version: 0, revision: null,
      fields: [], actions: [], events: [], notes: [], map: null, adaptationReport: {
        version: 1, entryRevision: 'a'.repeat(64), opening: { source: 'first_mes', index: 0 },
        initial: 'native', runtime: 'adapted', findings: [], ruleScope: firstTaskScope,
      } }, null);
    expect(prompt).toContain('不代表当前总余额');
    expect(prompt).toContain('初值条目保持禁用');
    expect(prompt).not.toContain('sans');
  });
});

describe.skipIf(!existsSync(samplePath))('private original first task source', () => {
  async function fixture() {
    const bytes = readFileSync(samplePath);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('fc31c5ef3dbfff378067963b81f2078fab0a48b98210d22b7e2edf087e8811de');
    const parsed = await parseCharacterPng(bytes);
    const book = characterWorldbookSchema.parse(parsed.cardData.character_book);
    const characterId = randomUUID();
    const content: StoryContentSnapshot = { protocol: 1, revision: 'a'.repeat(64), capturedAt: new Date().toISOString(),
      characters: [{ id: characterId, name: parsed.name.trim(), description: parsed.description?.trim() ?? null,
        avatarUrl: null, promptTemplate: 'default', cardData: parsed.cardData }] };
    const sources: StorySources = { characters: [], books: [{ id: randomUUID(), characterId, scope: 'character', name: book.name!,
      isEnabled: true, entryCount: 5, enabledEntryCount: 4, entries: book.entries.map(mapCharacterWorldbookEntry) }] };
    return { content, sources, compile: () => compileStoryAdapter(content, sources, randomUUID(), 'b'.repeat(64)) };
  }
  it('freezes the actual first opening, disabled initial entry and narrow scope while keeping author data intact', async () => {
    const input = await fixture();
    const original = JSON.stringify(input.content.characters[0].cardData);
    const artifact = input.compile();
    expect(artifact).toMatchObject({ conclusion: 'supported', reason: 'reviewed-first-task', rules: firstTaskRules() });
    expect(isCurrentStoryAdapter(artifact, input.content, input.sources)).toBe(true);
    input.sources.books[0].entries.reverse();
    expect(input.compile()).toMatchObject({ conclusion: 'supported', sources: [{ entryIndex: 3, digest: firstTaskSourceDigest }] });
    input.sources.books[0].entries.reverse();
    input.content.characters[0].adaptation = artifact;
    const profile = buildStoryEntryProfile(input.content, input.sources);
    expect(profile.openings).toHaveLength(1);
    expect(profile.initialFields).toHaveLength(2);
    selectStoryOpening(input.content, input.sources, { characterId: profile.characterId, revision: profile.revision,
      reference: { source: 'first_mes', index: 0 }, reviewed: true });
    const frozen = storyContentSnapshotSchema.parse(structuredClone(input.content));
    expect(frozen.characters[0].adaptationReport?.ruleScope).toBe(firstTaskScope);
    expect(input.sources.books[0].entries[3].isEnabled).toBe(false);
    expect(JSON.stringify(input.content.characters[0].cardData)).toBe(original);
    const invalid = structuredClone(frozen);
    invalid.characters[0].adaptationReport!.ruleScope = openingModeScope;
    expect(storyContentSnapshotSchema.safeParse(invalid).success).toBe(false);
    const noOpening = structuredClone(frozen);
    noOpening.characters[0].opening!.reference = { source: 'none', index: 0 };
    noOpening.characters[0].adaptationReport!.opening = { source: 'none', index: 0 };
    expect(storyContentSnapshotSchema.safeParse(noOpening).success).toBe(false);
    input.sources.books[0].entries[3].content += '\nChanged';
    expect(isCurrentStoryAdapter(artifact, input.content, input.sources)).toBe(false);
    expect(frozenStoryRules(frozen.characters[0])).toEqual(firstTaskRules());
  });
  it('does not exempt a changed initialization from the existing opening conflict guard', async () => {
    const { content } = await fixture();
    const card = content.characters[0].cardData;
    const reference = { source: 'first_mes' as const, index: 0 };
    expect(prepareFirstTaskOpeningRecord(card, reference)).toMatchObject({ status: 'native', reason: 'reviewed-first-task', fields: [] });
    card.first_mes = String(card.first_mes).replaceAll('2个任务点数', '3个任务点数');
    expect(prepareFirstTaskOpeningRecord(card, reference)).toMatchObject({ status: 'conflict', reason: 'native-conflict', fields: [] });
  });
  it.each(['reward', 'description', 'alternate', 'prompt', 'book', 'task-entry', 'init-entry', 'enabled-init',
    'disabled-task', 'disabled-book', 'keyword', 'probability', 'delay', 'filter', 'extra-book', 'scope', 'foreign'])('rejects changed %s rather than borrowing a reviewed mechanism', async kind => {
    const input = await fixture();
    const character = input.content.characters[0];
    const book = input.sources.books[0];
    const entry = book.entries[1];
    if (kind === 'reward') character.cardData.first_mes = String(character.cardData.first_mes).replaceAll('2个任务点数', '20个任务点数');
    if (kind === 'description') character.description += '\nChanged';
    if (kind === 'alternate') character.cardData.alternate_greetings = ['另一项任务'];
    if (kind === 'prompt') character.promptTemplate = 'alternate';
    if (kind === 'book') book.name += ' changed';
    if (kind === 'task-entry') entry.content += '\nChanged';
    if (kind === 'init-entry') book.entries[3].content += '\nChanged';
    if (kind === 'enabled-init') book.entries[3].isEnabled = true;
    if (kind === 'disabled-task') entry.isEnabled = false;
    if (kind === 'disabled-book') book.isEnabled = false;
    if (kind === 'keyword') Object.assign(entry, { keyword: 'other' });
    if (kind === 'probability') Object.assign(entry.settings!, { probability: 50 });
    if (kind === 'delay') Object.assign(entry.settings!, { delay: 1 });
    if (kind === 'filter') Object.assign(entry, { characterFilter: [randomUUID()] });
    if (kind === 'extra-book') input.sources.books.push({ ...structuredClone(book), id: randomUUID() });
    if (kind === 'scope') book.scope = 'global';
    if (kind === 'foreign') book.characterId = randomUUID();
    expect(input.compile().conclusion).toBe('unsupported');
  });
});
