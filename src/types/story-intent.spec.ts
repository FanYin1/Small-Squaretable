import { describe, expect, it } from 'vitest';
import { parseStoryIntentOutput, shouldPersistStoryIntentInvalid, storyIntentSchema, storyIntentVisiblePrefix, storyIntentPresentation, STORY_INTENT_MARKER, STORY_INTENT_REVIEW_TEXT } from './story-intent';
import { buildDirectStoryPrompt, buildStoryIntentPrompt } from '../server/services/story-intent-prompt';

const execute = { kind: 'execute', actionId: 'buy', evidence: '买一张通行证' };
const proposal = { version: 1, disposition: 'proposal', steps: [execute], facts: [] };
const encode = (value: unknown) => `我理解你想购买通行证，请确认。${STORY_INTENT_MARKER}${JSON.stringify(value)}</story-intent>`;

describe('reviewable story intent protocol', () => {
  it('publishes a direct execution reply and rejects a legacy proposal in direct mode', () => {
    const intent = { ...proposal, disposition: 'execution' };
    const raw = `你已买好通行证。${STORY_INTENT_MARKER}${JSON.stringify(intent)}</story-intent>`;
    expect(parseStoryIntentOutput(raw, '买一张通行证', ['buy']).intent).toEqual(intent);
    expect(storyIntentPresentation(raw, '买一张通行证', ['buy'], false, true)).toBe('你已买好通行证。');
    expect(storyIntentPresentation(encode(proposal), '买一张通行证', ['buy'], false, true)).toContain('故事状态未更新');
    expect(storyIntentPresentation(raw, '先等等', ['buy'], false, true)).toContain('故事状态未更新');
    expect(storyIntentSchema.safeParse({ ...intent, steps: [execute, { kind: 'refuse', description: '不买', evidence: '不买' }] }).success).toBe(false);
  });
  it('requests direct narration while preserving genuine ambiguity, refusal and authored rule limits', () => {
    const prompt = buildDirectStoryPrompt([{ id: 'buy', label: '买票', outcome: '按规则扣除票款' }]);
    expect(prompt).toContain('Do not show an action interpretation');
    expect(prompt).toContain('genuinely ambiguous');
    expect(prompt).toContain('request to wait is not permission');
    expect(prompt).toContain('exactly 3 distinct recommendations');
    expect(prompt).toContain('server rechecks their conditions');
  });
  it('only marks an invalid protocol while an action is awaiting confirmation', () => {
    expect(shouldPersistStoryIntentInvalid({ interrupted: false, interpreting: true }, { invalid: true })).toBe(true);
    expect(shouldPersistStoryIntentInvalid({ interrupted: false, interpreting: false }, { invalid: true })).toBe(false);
    expect(shouldPersistStoryIntentInvalid({ interrupted: true, interpreting: true }, { invalid: true })).toBe(false);
  });
  it('requests fresh suggestions after approved actions without proposing the action again', () => {
    const prompt = buildStoryIntentPrompt([], true);
    expect(prompt).toContain('without asking for confirmation again');
    expect(prompt).toContain('exactly 3 distinct recommendations');
    expect(prompt).toContain('never rule actions or completed outcomes');
    expect(prompt).toContain('recommendationLead');
    expect(buildStoryIntentPrompt([])).toContain('maximum 120 characters');
  });
  it('parses optional grounded guidance separately from action authority', () => {
    const intent = { version: 1, disposition: 'expression', steps: [], facts: [] };
    const recommendationLead = { text: '你可以先了解通行证，也可以另提问题。', evidence: '购买通行证' };
    const parsed = parseStoryIntentOutput(encode({ ...intent, recommendationLead }), '先解释', []);
    expect(parsed.recommendationLead).toBe(recommendationLead.text);
    expect(parsed.intent).toEqual(intent);
    for (const invalid of [null, '非法格式', { ...recommendationLead, evidence: '不存在的线索' }, { ...recommendationLead, text: '字'.repeat(121) }]) {
      const result = parseStoryIntentOutput(encode({ ...intent, recommendationLead: invalid }), '先解释', []);
      expect(result.invalid).toBe(false);
      expect(result.intent).toEqual(intent);
      expect(result.recommendationLead).toBeUndefined();
    }
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


describe('cross-model text protocol normalization', () => {
  const value = { version: 1, disposition: 'expression', steps: [], facts: [] };
  const json = JSON.stringify(value);
  const variants = [
    `门边仍然安静。<story-intent>${json}</story-intent>`,
    `门边仍然安静。\r\n  <story-intent>${json}</story-intent>  \r\n`,
    `门边仍然安静。\n<story-intent>\n\`\`\`json\n${json}\n\`\`\`\n</story-intent>`,
    `门边仍然安静。\n\`\`\`json\n<story-intent>${json}</story-intent>\n\`\`\``,
  ];
  it.each(variants)('accepts only cosmetic differences and hides control syntax at every boundary: %s', raw => {
    const parsed = parseStoryIntentOutput(raw, '先解释', []);
    expect(parsed).toMatchObject({ content: '门边仍然安静。', intent: value, invalid: false });
    expect(parsed.warnings).toContain('format_normalized');
    let visible = '';
    for (let end = 1; end <= raw.length; end++) {
      const next = storyIntentVisiblePrefix(raw.slice(0, end));
      expect(next.startsWith(visible)).toBe(true);
      expect(next).not.toMatch(/<story|```|"version"/);
      visible = next;
    }
    expect(visible).toBe('门边仍然安静。');
    expect(storyIntentVisiblePrefix(raw, true)).toBe(visible);
  });
  it.each([
    ['正文\n<story-intent>{oops}</story-intent>', 'invalid_json'],
    ['正文\n<story-intent>{}', 'protocol_incomplete'],
    [`正文\n<story-intent>${json}</story-intent>trailing`, 'protocol_incomplete'],
    [`正文\n<story-intent>${JSON.stringify({ ...value, changes: { coins: 100 } })}</story-intent>`, 'invalid_schema'],
    ['正文\n<story-intent>' + 'x'.repeat(16001) + '{}</story-intent>', 'protocol_too_large'],
    ['正文\n<story-intent', 'protocol_incomplete'],
  ])('classifies failure without returning raw payload details', (raw, invalidReason) => {
    const result = parseStoryIntentOutput(raw, '先解释', []);
    expect(result).toMatchObject({ invalid: true, intent: null, invalidReason });
    expect(result).not.toHaveProperty('error');
  });
  it('keeps optional suggestions separate while preserving authority checks through fences', () => {
    const wrap = (authority: object) => `正文\n<story-intent>\n\`\`\`json\n${JSON.stringify({ ...authority, recommendations: 'bad', recommendationLead: 'bad' })}\n\`\`\`\n</story-intent>`;
    const parsed = parseStoryIntentOutput(wrap(value), '先解释', []);
    expect(parsed.invalid).toBe(false);
    expect(parsed.recommendations).toEqual([]);
    expect(parsed.warnings).toEqual(expect.arrayContaining(['recommendations_fallback', 'guidance_fallback']));
    expect(parseStoryIntentOutput(wrap({ ...proposal, disposition: 'execution' }), '没有选择', ['buy']).invalidReason).toBe('ungrounded_action');
    expect(parseStoryIntentOutput(wrap({ ...proposal, disposition: 'execution' }), '买一张通行证', []).invalidReason).toBe('unavailable_action');
  });
});


describe('redundant control object closer', () => {
  const value = { version: 1, disposition: 'expression', steps: [], facts: [] };
  const parse = (encoded: string, input = '') => parseStoryIntentOutput(`正文\n<story-intent>${encoded}</story-intent>`, input, ['buy']);

  it.each(['}', ' \n } \n'])('accepts exactly one extra root closer (%j)', suffix => {
    const parsed = parse(JSON.stringify(value) + suffix);
    expect(parsed).toMatchObject({ invalid: false, intent: value });
    expect(parsed.warnings).toContain('redundant_closer_removed');
    expect(parsed.jsonFailure).toBeUndefined();
  });

  it('preserves nested objects, escaped quotes, backslashes and quoted closers exactly', () => {
    const input = String.raw`观察 } ] { [ "引号" C:\notes` + '\\';
    const intent = { ...value, facts: [{ kind: 'claim', speaker: 'player', content: input, evidence: input }] };
    const parsed = parse(JSON.stringify(intent) + '}', input);
    expect(parsed.invalid).toBe(false);
    expect(parsed.intent).toEqual(intent);
  });

  it.each([
    ['multiple closers', JSON.stringify(value) + '}}'],
    ['second object', JSON.stringify(value) + '{}'],
    ['prose', JSON.stringify(value) + 'private'],
    ['comment', JSON.stringify(value) + '/* comment */}'],
    ['root array', JSON.stringify([value]) + '}'],
    ['trailing comma', '{"version":1,}}'],
    ['missing separator', '{"version":1 "facts":[]}}'],
    ['invalid escape', String.raw`{"facts":["private\q"]}}`],
    ['unterminated string', '{"facts":["private}}'],
    ['missing closer', '{"facts":[]'],
    ['mismatched brackets', '{"facts":[}}'],
  ])('does not repair %s', (_name, encoded) => {
    const parsed = parse(encoded);
    expect(parsed).toMatchObject({ invalid: true, invalidReason: 'invalid_json', intent: null });
    expect(parsed.warnings).not.toContain('redundant_closer_removed');
    expect(JSON.stringify(parsed.jsonFailure)).not.toContain('private');
  });

  it.each([
    [{ ...value, injected: true }, '', 'invalid_schema'],
    [{ ...proposal, disposition: 'execution' }, '没有选择', 'ungrounded_action'],
    [{ ...proposal, disposition: 'execution', steps: [{ ...execute, actionId: 'invented' }] }, '买一张通行证', 'unavailable_action'],
  ] as const)('still checks schema and action authority after normalization (%j)', (intent, input, code) => {
    const parsed = parse(JSON.stringify(intent) + '}', input);
    expect(parsed).toMatchObject({ invalid: true, invalidReason: code, intent: null });
    expect(parsed.warnings).toContain('redundant_closer_removed');
  });
});

describe('private JSON syntax diagnostics', () => {
  it.each([
    ['{"version":1,,}', 'comma'],
    ['{"version":1] }', 'array_close'],
    ['{"version":1 "private":2}', 'quote'],
    ['{"version":1}:', 'colon'],
    ['{"version":1},', 'comma'],
    ['{"version":1}private', 'letter'],
  ] as const)('classifies the failing punctuation without storing source text (%s)', (encoded, token) => {
    const parsed = parseStoryIntentOutput(`正文\n<story-intent>${encoded}</story-intent>`, '', []);
    expect(parsed.jsonFailure).toMatchObject({ token, length: encoded.length });
    expect(JSON.stringify(parsed.jsonFailure)).not.toContain('private');
  });
  it.each([
    ['{"version":1,"facts":[1,,]}', 'syntax'],
    ['{"facts":["private\nquote"]}', 'unescaped_control'],
    [String.raw`{"facts":["private\q"]}`, 'invalid_escape'],
    ['{"facts":["private', 'unterminated_string'],
    ['{"facts":', 'unexpected_end'],
    ['{version:1}', 'expected_property'],
    ['{"version" 1}', 'missing_separator'],
    ['{"version":1}extra', 'unexpected_content'],
  ] as const)('keeps invalid JSON rejected and reports only fixed diagnostics (%s)', (encoded, kind) => {
    const result = parseStoryIntentOutput(`正文\n<story-intent>${encoded}</story-intent>`, '输入', []);
    expect(result).toMatchObject({ invalid: true, intent: null, invalidReason: 'invalid_json', jsonFailure: { kind, length: encoded.length } });
    expect(JSON.stringify(result.jsonFailure)).not.toMatch(/private|quote|facts|extra/);
    if (result.jsonFailure?.offset != null) expect(result.jsonFailure.offset).toBeLessThanOrEqual(encoded.length);
  });
  it('preserves escaped evidence without rewriting authority or characters', () => {
    const input = '他说"等等"，路径 C:\\notes\n下一行';
    const value = { version: 1, disposition: 'expression', steps: [], facts: [{ kind: 'claim', speaker: 'player', content: input, evidence: input }] };
    const parsed = parseStoryIntentOutput(`正文\n<story-intent>${JSON.stringify(value)}</story-intent>`, input, []);
    expect(parsed.invalid).toBe(false);
    expect(parsed.intent?.facts[0].evidence).toBe(input);
    expect(parsed.jsonFailure).toBeUndefined();
  });
  it('requires valid JSON encoding in direct, approved and legacy prompts', () => {
    for (const prompt of [buildDirectStoryPrompt([]), buildStoryIntentPrompt([], true), buildStoryIntentPrompt([])]) {
      expect(prompt).toContain('exactly one valid JSON object');
      expect(prompt).toContain('no extra closing brace');
      expect(prompt).toContain('Separate adjacent properties/items with commas');
      expect(prompt).toContain('decoding must reproduce the original evidence exactly');
      expect(prompt).toContain('never omit or change the actual action');
      expect(prompt).toContain(String.raw`"He said \"wait\""`);
    }
  });
});

describe('control envelope diagnostics', () => {
  const json = JSON.stringify({ version: 1, disposition: 'expression', steps: [], facts: [] });
  it.each([
    ['正文\n<story-intent private', 'partial_open', 0],
    [`正文\n<story-intent>${json}`, 'missing_close', 0],
    [`正文\n<story-intent>${json}</story-intent>.`, 'trailing_content', 1],
    [`正文\n<story-intent>${json}</story-intent>\nprivate panel`, 'trailing_content', 13],
  ] as const)('rejects malformed framing without retaining private text (%s)', (raw, kind, trailingCharacters) => {
    const result = parseStoryIntentOutput(raw, '', []);
    expect(result).toMatchObject({ invalid: true, intent: null, invalidReason: 'protocol_incomplete',
      protocolFailure: { kind, trailingCharacters } });
    expect(result.protocolFailure?.controlCharacters).toBeGreaterThan(0);
    expect(JSON.stringify(result.protocolFailure)).not.toContain('private');
  });
  it('accepts the literal direct prompt example without having to remove punctuation or commentary', () => {
    const prompt = buildDirectStoryPrompt([]);
    const example = prompt.slice(prompt.lastIndexOf('\n正文。') + 1);
    expect(example).toMatch(/^正文。\n<story-intent>/);
    expect(example.endsWith('</story-intent>')).toBe(true);
    expect(parseStoryIntentOutput(example, '', [])).toMatchObject({ invalid: false, intent: { disposition: 'expression' } });
    expect(parseStoryIntentOutput(example, '', []).protocolFailure).toBeUndefined();
  });
});


describe('single redundant control quote', () => {
  const value = { version: 1, disposition: 'expression', steps: [], facts: [] };
  const wrap = (encoded: string) => `正文。\n<story-intent>${encoded}</story-intent>`;
  it('accepts only one quote after a complete valid object and records normalization', () => {
    const result = parseStoryIntentOutput(wrap(JSON.stringify(value) + '"'), '', []);
    expect(result).toMatchObject({ invalid: false, intent: value, warnings: expect.arrayContaining(['redundant_quote_removed']) });
  });
  it('accepts one redundant array closer after a complete valid root object', () => {
    const result = parseStoryIntentOutput(wrap(JSON.stringify(value) + ']'), '', []);
    expect(result).toMatchObject({ invalid: false, intent: value, warnings: expect.arrayContaining(['redundant_closer_removed']) });
  });
  it.each(['""', '"private', '{}"', ',"', "''", ']]'])( 'rejects ambiguous suffix %s', suffix => {
    expect(parseStoryIntentOutput(wrap(JSON.stringify(value) + suffix), '', []).invalidReason).toBe('invalid_json');
  });
  it.each(['{"version":1 "facts":[]}"', '{"facts":["unfinished}"', '[{}]"'])( 'never repairs incomplete or invalid JSON %s', encoded => {
    expect(parseStoryIntentOutput(wrap(encoded), '', []).invalidReason).toBe('invalid_json');
  });
  it('still rejects ungrounded actions and unavailable rules after removing the suffix', () => {
    const execution = { ...proposal, disposition: 'execution' };
    expect(parseStoryIntentOutput(wrap(JSON.stringify(execution) + '"'), '没有选择', ['buy']).invalidReason).toBe('ungrounded_action');
    expect(parseStoryIntentOutput(wrap(JSON.stringify(execution) + '"'), '买一张通行证', []).invalidReason).toBe('unavailable_action');
    expect(parseStoryIntentOutput(wrap(JSON.stringify({ ...value, extra: true }) + '"'), '', []).invalidReason).toBe('invalid_schema');
  });
  it('preserves escaped quotes and quoted braces inside evidence', () => {
    const input = '查看 "门}边"';
    const intent = { ...value, facts: [{ kind: 'claim', speaker: 'player', content: input, evidence: input }] };
    expect(parseStoryIntentOutput(wrap(JSON.stringify(intent) + '"'), input, []).intent).toEqual(intent);
  });
});

describe('bounded presentation suffix normalization', () => {
  const value = { version: 1, disposition: 'expression', steps: [], facts: [] };
  const wrap = (json: string) => `正文。\n<story-intent>${json}</story-intent>`;
  it.each(["'", '`', '.', ';', '。', '；', '”', '’'])('accepts the single presentation suffix %s without changing values', suffix => {
    const input = '查看 `路径`，他说“等等”。';
    const intent = { ...value, facts: [{ kind: 'claim', speaker: 'player', content: input, evidence: input }] };
    const result = parseStoryIntentOutput(wrap(JSON.stringify(intent) + ' \n' + suffix), input, []);
    expect(result).toMatchObject({ invalid: false, intent, warnings: expect.arrayContaining(['trailing_punctuation_removed']) });
  });
  it.each(['x', '1', '。说明', '..', '```', ';{}', '{}', '[]', 'null', 'true', ',', ':', '+', '/', '\\', '\u200b'])(
    'rejects ambiguous or meaningful suffix %s', suffix => {
      expect(parseStoryIntentOutput(wrap(JSON.stringify(value) + suffix), '', [])).toMatchObject({ invalid: true, invalidReason: 'invalid_json', intent: null });
    });
  it.each(['{"version":1 "facts":[]}.', '{"facts":["unfinished}.', '[{}].', '{"facts":[]}{}.', '{"facts":[],}.'])(
    'does not repair a malformed root %s', json => {
      expect(parseStoryIntentOutput(wrap(json), '', []).invalidReason).toBe('invalid_json');
    });
  it.each([
    ["'private", 'apostrophe'], ['`private', 'backtick'], ['.private', 'period'], [';private', 'semicolon'],
    ['”private', 'typographic_quote'], ['private', 'letter'], ['7private', 'digit'],
  ])('reports only fixed punctuation categories for rejected suffix %s', (suffix, token) => {
    const result = parseStoryIntentOutput(wrap(JSON.stringify(value) + suffix), '', []);
    expect(result.jsonFailure).toMatchObject({ kind: 'unexpected_content', token });
    expect(JSON.stringify(result.jsonFailure)).not.toContain('private');
  });
});
