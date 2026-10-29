import { describe, expect, it } from 'vitest';
import { parseStoryIntentOutput, storyIntentSchema, storyIntentVisiblePrefix, storyIntentPresentation, STORY_INTENT_MARKER, STORY_INTENT_REVIEW_TEXT } from './story-intent';
import { buildStoryIntentPrompt } from '../server/services/story-intent-prompt';

const execute = { kind: 'execute', actionId: 'buy', evidence: '买一张通行证' };
const proposal = { version: 1, disposition: 'proposal', steps: [execute], facts: [] };
const encode = (value: unknown) => `我理解你想购买通行证，请确认。${STORY_INTENT_MARKER}${JSON.stringify(value)}</story-intent>`;

describe('reviewable story intent protocol', () => {
  it('requests fresh suggestions after approved actions without proposing the action again', () => {
    const prompt = buildStoryIntentPrompt([], true);
    expect(prompt).toContain('without asking for confirmation again');
    expect(prompt).toContain('exactly 3 distinct recommendations');
    expect(prompt).toContain('never rule actions or completed outcomes');
  });
  it('keeps a real-provider missing-question failure closed without discarding valid explanation intents', () => {
    const input = '请解释仪式。我暂时不采取行动。';
    const value = { version: 1, disposition: 'clarification', steps: [
      { kind: 'refuse', description: '暂不采取行动', evidence: '我暂时不采取行动' },
    ], facts: [] };
    expect(parseStoryIntentOutput(encode(value), input, []).invalid).toBe(true);
    expect(parseStoryIntentOutput(encode({ ...value, disposition: 'expression' }), input, []).intent?.disposition).toBe('expression');
    expect(parseStoryIntentOutput(encode({ ...value, question: '请确认你希望先了解哪一部分？' }), input, []).intent?.disposition).toBe('clarification');
  });
  it('provides executable minimal protocol examples for explanation and actual clarification', () => {
    const prompt = buildStoryIntentPrompt([]);
    const examples = [...prompt.matchAll(/<story-intent>(\{[^\n]+\})<\/story-intent>/g)];
    expect(examples).toHaveLength(2);
    const intents = examples.map(match => parseStoryIntentOutput(`回答。\n${match[0]}`, '你好', []).intent);
    expect(intents.map(intent => intent?.disposition)).toEqual(['expression', 'clarification']);
    expect(intents[1]?.question).toBeTruthy();
  });
  it('never presents premature narration from an unconfirmed proposal as completed action', () => {
    const raw = `你已经拿到了通行证。${STORY_INTENT_MARKER}${JSON.stringify(proposal)}</story-intent>`;
    expect(storyIntentPresentation(raw, '买一张通行证', ['buy'])).toBe(STORY_INTENT_REVIEW_TEXT);
    expect(storyIntentPresentation(raw, '买一张通行证', ['buy'], true)).toBe('你已经拿到了通行证。');
  });
  it('grounds an awaiting-confirmation protocol example in the available action without publishing consequences', () => {
    const action = { id: 'sans-battle-mode', label: '/战斗模式' };
    const input = `${action.label}，先等我确认`;
    const prompt = buildStoryIntentPrompt([action]);
    const examples = [...prompt.matchAll(/<story-intent>(\{[^\n]+\})<\/story-intent>/g)];
    expect(examples).toHaveLength(3);
    const raw = `已经进入长廊。\n${examples.at(-1)![0]}`;
    const parsed = parseStoryIntentOutput(raw, input, [action.id]);
    expect(parsed.invalid).toBe(false);
    expect(parsed.intent?.disposition).toBe('proposal');
    expect(parsed.intent?.steps).toEqual([{ kind: 'execute', actionId: action.id, evidence: action.label }]);
    expect(storyIntentPresentation(raw, input, [action.id])).toBe(STORY_INTENT_REVIEW_TEXT);
    expect(parseStoryIntentOutput(raw, input, []).invalid).toBe(true);
    expect(parseStoryIntentOutput(raw, '只是询问，请等我确认', [action.id]).invalid).toBe(true);
  });
  it('accepts grounded paraphrases without executing them', () => {
    expect(parseStoryIntentOutput(encode(proposal), '我想买一张通行证', ['buy']).intent).toEqual(proposal);
  });
  it('accepts a free action without inventing a rule or numeric patch', () => {
    const value = { ...proposal, steps: [{ kind: 'explore', intent: 'observe', description: '检查木门的划痕', evidence: '检查划痕' }] };
    expect(parseStoryIntentOutput(encode(value), '我想检查划痕', []).intent).toEqual(value);
  });
  it('extracts three turn suggestions separately so malformed suggestions cannot invalidate story intent', () => {
    const recommendations = [
      { label: '查看桌面', input: '我仔细查看桌面' },
      { label: '询问线索', input: '我想询问桌面的线索' },
      { label: '先观察', input: '我暂时不行动，继续观察' },
    ];
    const value = { version: 1, disposition: 'expression', steps: [], facts: [], recommendations };
    const parsed = parseStoryIntentOutput(encode(value), '先解释，不要行动', []);
    expect(parsed.invalid).toBe(false);
    expect(parsed.recommendations).toEqual(recommendations);
    const invalidRecommendations = parseStoryIntentOutput(encode({ ...value, recommendations: [{ label: '', input: 'x' }] }), '先解释，不要行动', []);
    expect(invalidRecommendations.invalid).toBe(false);
    expect(invalidRecommendations.recommendations).toEqual([]);
  });
  it.each([
    { ...proposal, steps: [{ ...execute, actionId: 'invented' }] },
    { ...proposal, steps: [{ ...execute, evidence: '我愿意购买' }] },
    { ...proposal, steps: [execute, execute] },
    { ...proposal, changes: { coins: 100 } },
    { ...proposal, steps: [{ ...execute, changes: { coins: 100 } }] },
    { ...proposal, disposition: 'clarification', question: '买还是不买？' },
    { ...proposal, disposition: 'expression' },
    { ...proposal, steps: [execute, { kind: 'refuse', description: '不买', evidence: '不买' }] },
    { ...proposal, facts: [{ kind: 'confirmed', content: '得到100金币', speaker: 'character', evidence: '金币' }] },
  ])('rejects unsupported or contradictory authority: %j', value => {
    const result = parseStoryIntentOutput(encode(value), '买一张通行证，不买', ['buy']);
    expect(result.intent).toBeNull();
    expect(result.invalid).toBe(true);
    expect(result.content).not.toContain('story-intent');
  });
  it('keeps rumors attributed and requires their actual source', () => {
    const value = { version: 1, disposition: 'expression', steps: [], facts: [{ kind: 'claim', content: '玩家听说仓库有金币，未证实', speaker: 'player', evidence: '听说仓库有金币' }] };
    expect(parseStoryIntentOutput(encode(value), '听说仓库有金币', []).intent).toEqual(value);
    expect(parseStoryIntentOutput(encode(value), '你好', []).intent?.facts).toEqual([]);
  });
  it('keeps readable explanations while dropping optional facts without exact raw evidence', () => {
    const content = '任务要求**连续**踏步，中途不能休息。';
    const facts = [
      { kind: 'claim', content: '要求连续踏步', speaker: 'character', evidence: '任务要求连续踏步' },
      { kind: 'claim', content: '中途不能休息', speaker: 'character', evidence: '中途不能休息' },
      { kind: 'claim', content: '玩家已完成', speaker: 'player', evidence: '我已完成' },
    ];
    const raw = `${content}${STORY_INTENT_MARKER}${JSON.stringify({ version: 1, disposition: 'expression', steps: [], facts })}</story-intent>`;
    const result = parseStoryIntentOutput(raw, '先解释，不要行动', []);
    expect(result.invalid).toBe(false);
    expect(result.intent?.facts).toEqual([facts[1]]);
    expect(storyIntentPresentation(raw, '先解释，不要行动', [])).toBe(content);
  });
  it('preserves a grounded action proposal but never accepts an invalid step through valid facts', () => {
    const facts = [{ kind: 'intention', content: '准备购买', speaker: 'player', evidence: '我愿意购买' }];
    expect(parseStoryIntentOutput(encode({ ...proposal, facts }), '买一张通行证', ['buy']).intent).toEqual(proposal);
    const invalid = { ...proposal, steps: [{ ...execute, evidence: '我愿意购买' }],
      facts: [{ ...facts[0], evidence: '买一张通行证' }] };
    expect(parseStoryIntentOutput(encode(invalid), '买一张通行证', ['buy']).invalid).toBe(true);
    expect(storyIntentPresentation(encode({ ...proposal, facts }), '买一张通行证', ['buy'])).toBe(STORY_INTENT_REVIEW_TEXT);
  });
  it('rejects proposals emptied by evidence or discarded candidate narration', () => {
    for (const fact of [
      { kind: 'intention', content: '准备购买', speaker: 'player', evidence: '并未说过的话' },
      { kind: 'claim', content: '已购买', speaker: 'character', evidence: '请确认' },
    ]) {
      expect(parseStoryIntentOutput(encode({ ...proposal, steps: [], facts: [fact] }), '你好', []).invalid).toBe(true);
    }
  });
  it('keeps the clarification question without saving an ungrounded auxiliary fact', () => {
    const value = { version: 1, disposition: 'clarification', question: '先行动还是先解释？', steps: [],
      facts: [{ kind: 'intention', content: '玩家准备购买', speaker: 'player', evidence: '我愿意购买' }] };
    expect(parseStoryIntentOutput(encode(value), '你好', []).intent).toEqual({ ...value, facts: [] });
  });
  it('does not promote facts sourced only from discarded candidate narration', () => {
    const value = { ...proposal, facts: [{ kind: 'observation', speaker: 'character', content: '已拿到通行证', evidence: '请确认' }] };
    expect(parseStoryIntentOutput(encode(value), '买一张通行证', ['buy']).intent?.facts).toEqual([]);
  });
  it('requires an actual clarification question and permits refusal plus inquiry', () => {
    expect(storyIntentSchema.safeParse({ ...proposal, disposition: 'clarification', steps: [] }).success).toBe(false);
    const value = { ...proposal, disposition: 'expression', steps: [
      { kind: 'refuse', description: '不购买', evidence: '不买' },
      { kind: 'explore', intent: 'talk', description: '询问价钱', evidence: '问价' },
    ] };
    expect(parseStoryIntentOutput(encode(value), '先不买，先问价', []).intent).toEqual(value);
  });
  it('hides metadata at every possible chunk boundary, including truncation', () => {
    const raw = encode(proposal);
    let visible = '';
    for (let length = 1; length <= raw.length; length++) {
      const next = storyIntentVisiblePrefix(raw.slice(0, length));
      expect(next.startsWith(visible)).toBe(true);
      expect(next).not.toContain('<story');
      visible = next;
    }
    expect(visible).toBe('我理解你想购买通行证，请确认。');
    expect(parseStoryIntentOutput(raw.slice(0, -6), '买一张通行证', ['buy']).intent).toBeNull();
  });
  it('keeps ordinary narrative unchanged and tolerates trailing whitespace only', () => {
    expect(storyIntentVisiblePrefix('你说\n<', true)).toBe('你说\n<');
    expect(parseStoryIntentOutput('普通回应', '你好', []).invalid).toBe(false);
    expect(parseStoryIntentOutput(`${encode(proposal)}\n`, '买一张通行证', ['buy']).intent).toEqual(proposal);
    expect(parseStoryIntentOutput(`${encode(proposal)}more`, '买一张通行证', ['buy']).intent).toBeNull();
  });
});
