import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { inspectStoryRuleSources } from './story-rule-inspection.service';
import type { StoryContentSnapshot } from '../../types/story-content';
import type { StorySources } from './story-diagnostics.service';

function fixture(text = '每月如果余额达到100，支付10金币。随机掷骰决定奖励。\n<UpdateVariable>_.add("coins", -10)</UpdateVariable>') {
  const id = randomUUID();
  const content: StoryContentSnapshot = { protocol: 1, revision: 'a'.repeat(64), capturedAt: '2026-10-27T00:00:00.000Z',
    characters: [{ id, name: '规则线索夹具', description: 'PRIVATE_DESCRIPTION', avatarUrl: null, promptTemplate: null, cardData: {} }] };
  const sources: StorySources = { characters: [], books: [{ id: randomUUID(), characterId: id, name: 'PRIVATE_BOOK_NAME', scope: 'character',
    isEnabled: true, entryCount: 1, enabledEntryCount: 1, entries: [{ content: text, isEnabled: true }] }] };
  return { content, sources, revision: 'b'.repeat(64), text };
}
const inspect = (input = fixture()) => inspectStoryRuleSources(input.content, input.sources, input.revision);

describe('bounded lexical rule inspection is evidence for review, never an executable conversion', () => {
  it('categorizes five clue kinds with verifiable source offsets and no raw private content', () => {
    const input = fixture();
    const before = JSON.stringify(input);
    const result = inspect(input);
    expect(result.groups.map(group => group.kind)).toEqual(['numeric-change', 'random', 'periodic', 'conditional', 'external-update']);
    for (const group of result.groups) for (const example of group.examples) {
      expect(example.source).toEqual({ kind: 'book', bookId: input.sources.books[0].id, entryIndex: 0 });
      expect(example.digest).toBe(createHash('sha256').update(input.text).digest('hex'));
      expect(input.text.slice(example.start, example.end).length).toBeGreaterThan(0);
      expect(example.line).toBe(input.text.slice(0, example.start).split('\n').length);
    }
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|coins|余额|奖励/);
    expect(result).not.toHaveProperty('rules');
    expect(JSON.stringify(input)).toBe(before);
  });
  it.each(['book-disabled', 'entry-disabled', 'global', 'other-card'])('does not scan %s', kind => {
    const input = fixture();
    if (kind === 'book-disabled') input.sources.books[0].isEnabled = false;
    if (kind === 'entry-disabled') input.sources.books[0].entries[0].isEnabled = false;
    if (kind === 'global') input.sources.books[0].scope = 'global';
    if (kind === 'other-card') input.sources.books[0].characterId = randomUUID();
    expect(inspect(input)).toMatchObject({ coverage: 'complete', sourceCount: 0, groups: [] });
  });
  it('preserves original entry indices when disabled entries precede an active rule', () => {
    const input = fixture(); input.sources.books[0].entries.unshift({ content: '隐藏', isEnabled: false });
    expect(inspect(input).groups[0].examples[0].source).toMatchObject({ entryIndex: 1 });
  });
  it('scans specified live card fields/openings/extensions, not archived duplicates or author notes', () => {
    const input = fixture('');
    input.content.characters[0].cardData = { description: '消耗5点', first_mes: '每天领取', alternate_greetings: ['如果有钥匙'],
      creator_notes: '随机', _squaretableImport: { original: { description: '骰子' } }, data: { description: '掷骰' },
      extensions: { regex_scripts: [{ disabled: true, replaceString: '<UpdateVariable>' }], unrelated: '随机' } };
    const result = inspect(input);
    expect(result.sourceCount).toBe(4);
    expect(result.groups.some(group => group.kind === 'random')).toBe(false);
    expect(result.groups.find(group => group.kind === 'external-update')?.examples[0].source).toMatchObject({ kind: 'extension', field: 'regex_scripts' });
  });
  it('refuses partial conclusions beyond source size and count limits', () => {
    const large = fixture('增加10'.repeat(500001));
    expect(inspect(large)).toMatchObject({ coverage: 'source-limit', groups: [] });
    const many = fixture(); many.sources.books[0].entries = Array.from({ length: 2001 }, () => ({ content: '消耗10', isEnabled: true }));
    expect(inspect(many)).toMatchObject({ coverage: 'source-limit', sourceCount: 2001, groups: [] });
  });
  it('counts occurrences but returns at most three distinct source examples per kind', () => {
    const input = fixture(); input.sources.books[0].entries = Array.from({ length: 8 }, () => ({ content: '每月支付10金币，每天支付5金币', isEnabled: true }));
    const result = inspect(input);
    expect(result.groups.find(group => group.kind === 'numeric-change')).toMatchObject({ occurrences: 16 });
    expect(result.groups.find(group => group.kind === 'numeric-change')?.examples).toHaveLength(3);
    expect(JSON.stringify(result).length).toBeLessThan(10000);
  });
  it('handles UTF-16 offsets and CRLF lines without rewriting the source', () => {
    const input = fixture('🌙夜晚\r\n支付10金币。');
    const example = inspect(input).groups[0].examples[0];
    expect(example.start).toBe(6); expect(example.line).toBe(2);
    expect(input.text.slice(example.start, example.end)).toBe('支付10');
  });
  it('no matches do not grant compatibility, and repeated inspections are deterministic', () => {
    const input = fixture('安静的小镇。');
    expect(inspect(input).groups).toEqual([]);
    expect(inspect(input)).toEqual(inspect(input));
    expect(inspect(input)).not.toHaveProperty('conclusion');
  });
});
