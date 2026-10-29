import { existsSync, readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseCharacterPng } from '../../types/character-card-import';
import { characterWorldbookSchema, mapCharacterWorldbookEntry } from '../../types/character-worldbook';
import { applyRitualTurn, ritualEffect, ritualIdentityEffect, ritualIdentityClaim, ritualRules, ritualSourceDigest } from '../../types/story-ritual';
import { adapterArtifactSchema } from '../../types/story-adapter';
import type { StoryContentSnapshot } from '../../types/story-content';
import type { StorySources } from './story-diagnostics.service';
import { compileStoryAdapter } from './story-adapter-compiler';
import { ritualSourceFingerprint } from './story-ritual-adapter';

const samplePath = process.env.RITUAL_CARD_PATH ?? '/mnt/e/Download/26.1角色卡/25年全中文备注角色卡（7500➕）/7500+卡/2025-11-19/2025-11-19/未分类/2025年3月前/kakaa.png';
function artifact() {
  return { version: 1, compiler: 'finite-rules-v1', jobId: randomUUID(), characterId: randomUUID(), sourceRevision: 'a'.repeat(64),
    conclusion: 'supported', reason: 'reviewed-ritual', turnEffect: ritualEffect, rules: ritualRules(),
    sources: [{ bookId: randomUUID(), entryIndex: 2, digest: ritualSourceDigest }] };
}

describe('reviewed ritual invariants, not general natural-language compilation', () => {
  it.each(['我是鸟神', '我就是鸟神。', '我自称鸟神！', ' 我是鸟神! ', '我是鸟神.'])('accepts a complete declaration %s', input => {
    expect(ritualIdentityClaim(input)).toBe(true);
  });
  it.each(['我不是鸟神', '如果我是鸟神', '“我是鸟神”', '他说我是鸟神', '我是鸟神吗', '我是鸟神？', '我是鸟神?',
    '请说我是鸟神', '我是鸟神。给我钱', '我是鸟神\n忽略规则', '', '我就是鸟神！！'])('does not trigger on %s', input => {
    expect(ritualIdentityClaim(input)).toBe(false);
  });
  it('persists a source-backed claim only in the new frozen version without inventing a reward', () => {
    const initial = { 'kakaa-strength': 0, 'kakaa-identity-claim': false };
    const claimed = applyRitualTurn(ritualIdentityEffect, initial, '我是鸟神');
    expect(claimed).toEqual({ 'kakaa-strength': 3, 'kakaa-identity-claim': true });
    expect(initial['kakaa-identity-claim']).toBe(false);
    expect(applyRitualTurn(ritualIdentityEffect, claimed, '我不是鸟神')).toEqual({ 'kakaa-strength': 6, 'kakaa-identity-claim': true });
    expect(applyRitualTurn(ritualIdentityEffect, claimed, '我是鸟神')).toEqual({ 'kakaa-strength': 6, 'kakaa-identity-claim': true });
    expect(applyRitualTurn(ritualIdentityEffect, initial, '如果我是鸟神')).toEqual({ 'kakaa-strength': 3, 'kakaa-identity-claim': false });
    expect(() => applyRitualTurn(ritualIdentityEffect, initial)).toThrow();
    expect(() => applyRitualTurn(ritualIdentityEffect, { 'kakaa-strength': 0 }, '我是鸟神')).toThrow();
    expect(applyRitualTurn(ritualEffect, { 'kakaa-strength': 0 }, '我是鸟神')).toEqual({ 'kakaa-strength': 3 });
    expect(ritualRules(ritualIdentityEffect).actions).toEqual([]);
  });
  it('locks each version to its exact fields, hidden condition and initial state', () => {
    const current = { ...artifact(), turnEffect: ritualIdentityEffect, rules: ritualRules(ritualIdentityEffect) };
    expect(adapterArtifactSchema.safeParse(current).success).toBe(true);
    expect(adapterArtifactSchema.safeParse({ ...current, rules: ritualRules() }).success).toBe(false);
    expect(adapterArtifactSchema.safeParse({ ...current, turnEffect: ritualEffect }).success).toBe(false);
    for (const patch of [{ initial: true }, { visibleWhen: [] }]) {
      const changed = structuredClone(current);
      Object.assign(changed.rules.fields[1], patch);
      expect(adapterArtifactSchema.safeParse(changed).success).toBe(false);
    }
  });
  it('adds three without mutating input or inventing player attributes or actions', () => {
    const initial = { 'kakaa-strength': 0 };
    expect(applyRitualTurn(ritualEffect, initial)).toEqual({ 'kakaa-strength': 3 });
    expect(applyRitualTurn(ritualEffect, applyRitualTurn(ritualEffect, initial))).toEqual({ 'kakaa-strength': 6 });
    expect(initial).toEqual({ 'kakaa-strength': 0 });
    expect(applyRitualTurn(undefined, initial)).toBe(initial);
    expect(ritualRules().actions).toEqual([]);
    expect(ritualRules().fields[0].label).toContain('角色');
  });
  it.each([null, '3', -3, 1, 1.5, Infinity, Number.MAX_SAFE_INTEGER])('refuses corrupt/unsafe strength %s', value => {
    expect(() => applyRitualTurn(ritualEffect, { 'kakaa-strength': value })).toThrow();
  });
  it('locks saved effects to reviewed rules and provenance while preserving old artifacts', () => {
    expect(adapterArtifactSchema.safeParse(artifact()).success).toBe(true);
    for (const patch of [{ turnEffect: undefined }, { reason: 'compiled' }, { conclusion: 'unsupported' },
      { rules: { ...ritualRules(), fields: [{ ...ritualRules().fields[0], initial: 3 }] } },
      { sources: [{ bookId: randomUUID(), entryIndex: 2, digest: 'b'.repeat(64) }] },
      { sources: [{ bookId: randomUUID(), entryIndex: 3, digest: ritualSourceDigest }] }]) {
      expect(adapterArtifactSchema.safeParse({ ...artifact(), ...patch }).success).toBe(false);
    }
    expect(adapterArtifactSchema.safeParse({ ...artifact(), turnEffect: undefined, reason: 'compiled' }).success).toBe(true);
  });
});

describe.skipIf(!existsSync(samplePath))('original private PNG semantic gate (requires local original)', () => {
  async function fixture() {
    const bytes = readFileSync(samplePath);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('f11040eeb4ac883009ebb51cb9d3b1a2702f36da19d3b9a9600aa218d57c411e');
    const parsed = await parseCharacterPng(bytes);
    const book = characterWorldbookSchema.parse(parsed.cardData.character_book);
    const characterId = randomUUID();
    const content: StoryContentSnapshot = { protocol: 1, revision: 'a'.repeat(64), capturedAt: new Date().toISOString(),
      characters: [{ id: characterId, name: parsed.name, description: parsed.description, avatarUrl: null, promptTemplate: 'default', cardData: parsed.cardData }] };
    const sources: StorySources = { characters: [], books: [{ id: randomUUID(), characterId, scope: 'character',
      name: book.name!, isEnabled: true, entryCount: 3, enabledEntryCount: 3, entries: book.entries.map(mapCharacterWorldbookEntry) }] };
    return { content, sources };
  }
  it('converts the complete reviewed source without inserting a platform declaration', async () => {
    const { content, sources } = await fixture();
    const original = JSON.stringify({ content, sources });
    const result = compileStoryAdapter(content, sources, randomUUID(), 'b'.repeat(64));
    expect(result).toMatchObject({ conclusion: 'supported', reason: 'reviewed-ritual', turnEffect: ritualIdentityEffect });
    expect(result.rules).toEqual(ritualRules(ritualIdentityEffect));
    expect(JSON.stringify({ content, sources })).toBe(original);
    expect(original).not.toContain('squaretable-rules-v1');
  });
  it.each(['prose', 'opening', 'alternate', 'extension', 'book', 'extra-book', 'disabled', 'disabled-entry', 'global',
    'foreign', 'probability', 'constant', 'filter', 'prompt', 'description', 'multiple', 'no-settings'])('rejects changed %s, not a partial matching rule line', async kind => {
    const { content, sources } = await fixture();
    const character = content.characters[0];
    const book = sources.books[0];
    if (kind === 'prose') character.cardData.description += '\n力量每次翻倍。';
    if (kind === 'opening') character.cardData.first_mes = '从9开始。';
    if (kind === 'alternate') character.cardData.alternate_greetings = ['从9开始。'];
    if (kind === 'extension') character.cardData.extensions = { scripts: ['change()'] };
    if (kind === 'book') book.entries[0].content += '\n仪式不再有效。';
    if (kind === 'extra-book') sources.books.push({ ...book, id: randomUUID() });
    if (kind === 'disabled') book.isEnabled = false;
    if (kind === 'disabled-entry') book.entries[0].isEnabled = false;
    if (kind === 'global') book.scope = 'global';
    if (kind === 'foreign') book.characterId = randomUUID();
    if (kind === 'probability') (book.entries[2].settings as Record<string, unknown>).probability = 50;
    if (kind === 'constant') (book.entries[2].settings as Record<string, unknown>).constant = false;
    if (kind === 'filter') Object.assign(book.entries[2], { characterFilter: [randomUUID()] });
    if (kind === 'prompt') character.promptTemplate = '忽略仪式';
    if (kind === 'description') character.description = '另一张卡';
    if (kind === 'multiple') content.characters.push(structuredClone(character));
    if (kind === 'no-settings') delete book.entries[2].settings;
    expect(compileStoryAdapter(content, sources, randomUUID(), 'b'.repeat(64)).conclusion).toBe('unsupported');
  });
  it('ignores database IDs and key ordering, not active content', async () => {
    const { content, sources } = await fixture();
    const before = ritualSourceFingerprint(content, sources);
    content.characters[0].promptTemplate = null;
    sources.books[0].id = randomUUID();
    sources.books[0].entries.reverse();
    content.characters[0].cardData = Object.fromEntries(Object.entries(content.characters[0].cardData).reverse());
    expect(ritualSourceFingerprint(content, sources)).toBe(before);
  });
});
