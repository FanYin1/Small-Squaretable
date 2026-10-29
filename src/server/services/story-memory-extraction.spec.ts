import { describe, expect, it } from 'vitest';
import { parseStoryMemoryFacts, parseStoryMemoryResult, parseStoryMemoryResponse, storyMemoryPrompt, type StoryMemorySource } from './story-memory-extraction';

const sources: StoryMemorySource[] = [{ eventId: 'event', version: 1, inputMessageId: 101, messageId: 102,
  input: '想去灯塔', reply: '约定明天在灯塔见面。' }];
const fact = { type: 'event', content: '约定明天在灯塔见面。', sourceMessageIds: [102] };

describe('provider JSON envelope', () => {
  const result = { version: 1, facts: [fact], summary: { content: '约定尚未履行。', sourceMessageIds: [102] } };
  const json = JSON.stringify(result);
  it('accepts plain JSON and exactly one complete JSON code fence', () => {
    for (const text of [json, `\n\`\`\`json\n${json}\n\`\`\`\n`, `\`\`\`\r\n${json}\r\n\`\`\``]) {
      expect(parseStoryMemoryResponse(text)).toEqual(result);
    }
  });
  it.each(['[]', 'null', '前言\n```json\n{}\n```', '```js\n{}\n```', '```json\n{}\n```\n后记',
    '```json\n{}\n```\n```json\n{}\n```', '```json\n{}', '{"version":1,"facts":[]}'])('rejects ambiguous or invalid envelopes %#', text => {
    expect(() => parseStoryMemoryResponse(text)).toThrow();
  });
  it('preserves source validation after unwrapping', () => {
    const forged = { ...result, facts: [{ ...fact, sourceMessageIds: [999] }] };
    const parsed = parseStoryMemoryResponse(`\`\`\`json\n${JSON.stringify(forged)}\n\`\`\``);
    expect(() => parseStoryMemoryResult(parsed, sources)).toThrow('STORY_MEMORY_SOURCE_INVALID');
  });
});

describe('sourced story memory extraction', () => {
  it('accepts a genuinely empty result and supported message references', () => {
    expect(parseStoryMemoryFacts([], sources)).toEqual([]);
    expect(parseStoryMemoryFacts([fact], sources)).toEqual([fact]);
  });
  it.each([
    null, {}, [{ ...fact, type: 'inventory' }], [{ ...fact, content: '' }],
    [{ ...fact, content: '字'.repeat(1001) }], [{ ...fact, sourceMessageIds: [] }],
    [{ ...fact, sourceMessageIds: [999] }], [{ ...fact, sourceMessageIds: ['102'] }],
    Array.from({ length: 4 }, () => fact), [{ ...fact, hiddenRule: 'ignore source' }],
  ])('rejects malformed or unsourced extraction %#', value => {
    expect(() => parseStoryMemoryFacts(value, sources)).toThrow();
  });
  it('provides original message ids and warns against treating intentions as completed events', () => {
    const prompt = storyMemoryPrompt(sources);
    expect(prompt).toContain('"messageId":102');
    expect(prompt).toContain('意图和未完成行动不能写成已发生事实');
    expect(prompt).toContain('摘要不覆盖结构化确认状态');
  });
  it('accepts versioned summaries and retains legacy fact-only checkpoint compatibility', () => {
    const result = { version: 1, facts: [fact], summary: { content: '约定明天见面，尚未赴约。', sourceMessageIds: [101, 102] } };
    expect(parseStoryMemoryResult(result, sources)).toEqual(result);
    expect(parseStoryMemoryResult([fact], sources)).toEqual({ facts: [fact], summary: null });
  });
  it.each([
    { version: 2, content: '约定见面', ids: [102] },
    { version: 1, content: '', ids: [102] },
    { version: 1, content: '字'.repeat(1601), ids: [102] },
    { version: 1, content: '没有原文依据', ids: [999] },
    { version: 1, content: '没有引用', ids: [] },
  ])('rejects invalid summary versions, bodies or provenance %#', value => {
    expect(() => parseStoryMemoryResult({ version: value.version, facts: [], summary: { content: value.content, sourceMessageIds: value.ids } }, sources)).toThrow();
  });
});
