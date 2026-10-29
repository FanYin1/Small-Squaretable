import { existsSync, readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseCharacterPng } from '../../types/character-card-import';
import { characterWorldbookSchema, mapCharacterWorldbookEntry } from '../../types/character-worldbook';
import { openingModeRules, openingModeScope, openingModeSourceDigest } from '../../types/story-opening-mode';
import { adapterArtifactSchema, frozenStoryRules } from '../../types/story-adapter';
import { applyStoryAction, availableStoryActions, type StoryValues } from '../../types/story-state';
import { storyContentSnapshotSchema, type StoryContentSnapshot } from '../../types/story-content';
import type { StorySources } from './story-diagnostics.service';
import { compileStoryAdapter, isCurrentStoryAdapter } from './story-adapter-compiler';
import { buildStoryEntryProfile, selectStoryOpening } from './story-entry.service';
import { buildStoryTurnPrompt, projectOpeningModeSourcePrompt } from './story-turn-prompt';

const samplePath = process.env.OPENING_MODE_CARD_PATH ?? '/mnt/e/Download/26.1角色卡/25年全中文备注角色卡（7500➕）/7500+卡/2025-11-19/2025-11-19/已分类/2025年3月前/正常向(不分类)/sans.png';

describe('reviewed opening mode boundaries', () => {
  it.each(['sans-story-mode', 'sans-battle-mode'])('selects %s once and excludes the other mode without maintaining experience or a map', actionId => {
    const rules = openingModeRules();
    const initial: StoryValues = Object.fromEntries(rules.fields.map(field => [field.id, field.initial]));
    expect(availableStoryActions(rules, initial, [])).toHaveLength(2);
    const selected = rules.actions.find(action => action.id === actionId)!;
    const values = applyStoryAction(rules, selected, initial);
    expect(availableStoryActions(rules, values, [actionId])).toEqual([]);
    expect(availableStoryActions(rules, initial, [actionId])).toHaveLength(1);
    expect(values['sans-opening-lv']).toBe(actionId === 'sans-battle-mode' ? 19 : 0);
    expect(values['sans-opening-location']).toBe(actionId === 'sans-battle-mode' ? '审判长廊' : null);
    expect(initial['sans-mode']).toBe('未选择');
    expect(rules.fields.some(field => /exp|health|money/i.test(field.id))).toBe(false);
    expect(rules.map).toBeUndefined();
  });
  it('rejects modified receipts, prices and automatic effects and supplies the frozen scope to narration', () => {
    const receipt = { version: 1, compiler: 'finite-rules-v1', jobId: randomUUID(), characterId: randomUUID(), sourceRevision: 'a'.repeat(64),
      conclusion: 'supported', reason: 'reviewed-opening-mode', rules: openingModeRules(),
      sources: [{ bookId: randomUUID(), entryIndex: 0, digest: openingModeSourceDigest }] };
    expect(adapterArtifactSchema.safeParse(receipt).success).toBe(true);
    for (const patch of [{ conclusion: 'unsupported' }, { sources: [] }, { turnEffect: 'kakaa-ritual-v2' },
      { sources: [{ ...receipt.sources[0], entryIndex: 1 }] }, { sources: [{ ...receipt.sources[0], digest: 'b'.repeat(64) }] },
      { rules: { ...receipt.rules, fields: receipt.rules.fields.map(field => ({ ...field, initial: 100 })) } }]) {
      expect(adapterArtifactSchema.safeParse({ ...receipt, ...patch }).success).toBe(false);
    }
    expect(adapterArtifactSchema.safeParse({ ...receipt, reason: 'compiled' }).success).toBe(true);
    const prompt = buildStoryTurnPrompt({ protocol: 1, legacy: false, native: true, version: 0, revision: null,
      fields: [], actions: [], events: [], notes: [], map: null, adaptationReport: {
        version: 1, entryRevision: 'a'.repeat(64), opening: { source: 'alternate_greetings', index: 0 },
        initial: 'native', runtime: 'adapted', findings: [], ruleScope: openingModeScope,
      } }, null);
    expect(prompt).toContain('显示的是开局记录');
    expect(prompt).toContain('击杀经验');
  });
});

describe.skipIf(!existsSync(samplePath))('private complete-source opening mode conversion', () => {
  async function fixture() {
    const bytes = readFileSync(samplePath);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('297188b16b6fe4754ca4d9595711b6b67eae46595110f68b0703fd47ca8c1e19');
    const parsed = await parseCharacterPng(bytes);
    const book = characterWorldbookSchema.parse(parsed.cardData.character_book);
    const characterId = randomUUID();
    const content: StoryContentSnapshot = { protocol: 1, revision: 'a'.repeat(64), capturedAt: new Date().toISOString(),
      characters: [{ id: characterId, name: parsed.name.trim(), description: parsed.description?.trim() ?? null, avatarUrl: null, promptTemplate: 'default', cardData: parsed.cardData }] };
    const sources: StorySources = { characters: [], books: [{ id: randomUUID(), characterId, scope: 'character', name: book.name!,
      isEnabled: true, entryCount: 1, enabledEntryCount: 1, entries: book.entries.map(mapCharacterWorldbookEntry) }] };
    const compile = () => compileStoryAdapter(content, sources, randomUUID(), 'b'.repeat(64));
    return { content, sources, compile };
  }
  it('compiles an original without adding a declaration and freezes the exact narrow scope', async () => {
    const input = await fixture();
    const original = JSON.stringify(input.content.characters[0].cardData);
    const receipt = input.compile();
    expect(receipt).toMatchObject({ conclusion: 'supported', reason: 'reviewed-opening-mode', rules: openingModeRules() });
    expect(isCurrentStoryAdapter(receipt, input.content, input.sources)).toBe(true);
    input.content.characters[0].adaptation = receipt;
    const profile = buildStoryEntryProfile(input.content, input.sources);
    expect(profile.openings.map(opening => opening.kind)).toEqual(['directory', 'narrative']);
    expect(profile.initialFields).toEqual([{ id: 'sans-mode', label: '开局模式', value: '未选择' }]);
    selectStoryOpening(input.content, input.sources, { characterId: profile.characterId, revision: profile.revision,
      reference: { source: 'alternate_greetings', index: 0 }, reviewed: false });
    const frozen = storyContentSnapshotSchema.parse(JSON.parse(JSON.stringify(input.content)));
    expect(frozen.characters[0].adaptationReport?.ruleScope).toBe(openingModeScope);
    expect(frozenStoryRules(frozen.characters[0])).toEqual(openingModeRules());
    const legacy = structuredClone(frozen);
    delete legacy.characters[0].adaptationReport!.ruleScope;
    expect(storyContentSnapshotSchema.safeParse(legacy).success).toBe(true);
    for (const runtime of ['unsupported', 'native', 'unverified']) {
      const invalid = structuredClone(frozen);
      Object.assign(invalid.characters[0].adaptationReport!, { runtime });
      expect(storyContentSnapshotSchema.safeParse(invalid).success).toBe(false);
    }
    const unrelated = structuredClone(frozen);
    delete unrelated.characters[0].adaptation;
    expect(storyContentSnapshotSchema.safeParse(unrelated).success).toBe(false);
    expect(JSON.stringify(input.content.characters[0].cardData)).toBe(original);
    input.sources.books[0].entries[0].content += '\nChanged';
    expect(isCurrentStoryAdapter(receipt, input.content, input.sources)).toBe(false);
    expect(frozenStoryRules(frozen.characters[0])).toEqual(openingModeRules());
  });
  it.each(['card', 'description', 'opening', 'prompt', 'book', 'entry', 'keyword', 'probability', 'delay', 'filter', 'extra-book', 'disabled-entry', 'disabled-book', 'scope', 'foreign', 'group'])('does not silently adopt altered %s sources', async kind => {
    const input = await fixture();
    const character = input.content.characters[0];
    const book = input.sources.books[0];
    const entry = book.entries[0];
    if (kind === 'card') character.cardData.description += '\nChanged';
    if (kind === 'description') character.description += '\nChanged';
    if (kind === 'opening') character.cardData.alternate_greetings = ['/战斗模式：Lv99'];
    if (kind === 'prompt') character.promptTemplate = 'alternate';
    if (kind === 'book') book.name += ' changed';
    if (kind === 'entry') entry.content += '\nChanged';
    if (kind === 'keyword') Object.assign(entry, { keyword: '/other' });
    if (kind === 'probability') Object.assign(entry.settings!, { probability: 50 });
    if (kind === 'delay') Object.assign(entry.settings!, { delay: 1 });
    if (kind === 'filter') Object.assign(entry, { characterFilter: [randomUUID()] });
    if (kind === 'extra-book') input.sources.books.push({ ...structuredClone(book), id: randomUUID() });
    if (kind === 'disabled-entry') entry.isEnabled = false;
    if (kind === 'disabled-book') book.isEnabled = false;
    if (kind === 'scope') book.scope = 'global';
    if (kind === 'foreign') book.characterId = randomUUID();
    if (kind === 'group') input.content.characters.push({ ...character, id: randomUUID() });
    expect(input.compile().conclusion).toBe('unsupported');
  });
  it('removes conflicting templates from derived card and worldbook prompts without rewriting the complete source', async () => {
    const { content, sources } = await fixture();
    const original = JSON.stringify({ content, sources });
    const texts = [content.characters[0].description!, ...Object.values(content.characters[0].cardData).filter((value): value is string => typeof value === 'string'),
      ...sources.books.flatMap(book => book.entries.map(entry => entry.content))];
    const projected = texts.map(text => projectOpeningModeSourcePrompt(text, openingModeScope)).join('\n');
    expect(texts.join('\n')).toContain('每个角色部分后所插入的角色最新状态栏');
    expect(projected).not.toMatch(/每个角色部分后所插入的角色最新状态栏|7\.sans必须在每次生产的结果的末尾显示|3\.sans必须在生成的内容末尾生成sans的状态栏|每10点EXP将会提升一次Lv|invalid and must be ignored/);
    expect(projected).toContain('Papyrus');
    expect(projected).toContain('审判长廊');
    expect(projected).toContain('今天是多么美好的一天啊');
    expect(JSON.stringify({ content, sources })).toBe(original);
  });
});
