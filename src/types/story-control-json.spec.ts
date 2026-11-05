import { expect, it } from 'vitest';
import { parseStoryIntentOutput, storyIntentVisiblePrefix } from './story-intent';
const value = { version: 1, disposition: 'expression', steps: [], facts: [] };
const parse = (encoded: string, input = '') => parseStoryIntentOutput(`正文\n<story-intent>${encoded}</story-intent>`, input, ['buy']);

it('removes only trailing separators from a complete valid envelope', () => {
  const result = parse('{"version":1,"disposition":"expression","steps":[],"facts":[],}');
  expect(result).toMatchObject({ invalid: false, intent: value });
  expect(result.warnings).toContain('trailing_commas_removed');
});
it('preserves evidence byte-for-byte, including comma-like text, quotes, escaped keys and backslashes', () => {
  const evidence = '观察 ,} ,] \\ " 候选';
  const fact = { kind: 'claim', speaker: 'player', content: evidence, evidence };
  const encoded = JSON.stringify({ ...value, facts: [fact] }).replace(/}\]}/, '},],}');
  const result = parse(encoded, evidence);
  expect(result.invalid).toBe(false); expect(result.intent?.facts).toEqual([fact]);
  expect(result.warnings).toContain('trailing_commas_removed');
});
it.each([
  '{"version":1,"version":1,"disposition":"expression","steps":[],"facts":[]}',
  '{"version":1,"disposition":"expression","disposition":"execution","steps":[],"facts":[]}',
  String.raw`{"version":1,"disposition":"expression","steps":[],"facts":[],"\u0076ersion":1}`,
  '{"version":1,"disposition":"expression","steps":[],"facts":[{"kind":"claim","kind":"claim","speaker":"player","content":"PRIVATE","evidence":"PRIVATE"}]}',
  '{"version":1,"disposition":"expression","steps":[],"facts":[],"recommendations":[],"recommendations":[]}',
])('rejects ambiguous duplicate keys anywhere: %s', encoded => {
  const result = parse(encoded);
  expect(result).toMatchObject({ invalid: true, invalidReason: 'invalid_json', jsonFailure: { kind: 'duplicate_key' } });
  expect(JSON.stringify(result.jsonFailure)).not.toContain('PRIVATE');
});
it.each([
  '{"version":1,"disposition":"expression","steps":[,],"facts":[]}',
  '{"version":1,"disposition":"expression","steps":[],"facts":[],,}',
  '{"version":1 "disposition":"expression","steps":[],"facts":[],}',
  '{"version":1,"disposition":"expression","steps":[],"facts":[],}}',
  '{"version":1,"disposition":"expression","steps":[],"facts":[]',
  '{"version":1,"disposition":"expression","steps":[],"facts":[],}{}',
])('never invents fields, guesses missing delimiters, or combines repair families: %s', encoded => {
  expect(parse(encoded)).toMatchObject({ invalid: true, invalidReason: 'invalid_json' });
});
it('does not repair absent envelope closing tags', () => {
  expect(parseStoryIntentOutput(`正文\n<story-intent>${JSON.stringify(value)}`, '', []).invalidReason).toBe('protocol_incomplete');
});
it('normalization cannot bypass authority or schema checks', () => {
  const intent = { ...value, disposition: 'execution', steps: [{ kind: 'execute', actionId: 'buy', evidence: '购买' }] };
  const encoded = JSON.stringify(intent).replace(/}$/, ',}');
  expect(parse(encoded, '不行动').invalidReason).toBe('ungrounded_action');
  expect(parseStoryIntentOutput(`正文\n<story-intent>${encoded}</story-intent>`, '购买', []).invalidReason).toBe('unavailable_action');
  expect(parse('{"version":1,}').invalidReason).toBe('invalid_schema');
});
it('allows identical property names in separate nested objects', () => {
  const facts = ['甲', '乙'].map(content => ({ kind: 'claim', speaker: 'player', content, evidence: content }));
  expect(parse(JSON.stringify({ ...value, facts }), '甲乙')).toMatchObject({ invalid: false, intent: { facts } });
});

it.each(['<story-intent', '<story-intent >{"private":"value"}', '<story-intent\n{"private":"value"}'])('hides malformed control envelopes without repairing them: %s', suffix => {
  const raw = `正文\n${suffix}`;
  expect(storyIntentVisiblePrefix(raw)).toBe('正文');
  expect(storyIntentVisiblePrefix(raw, true)).toBe('正文');
  expect(parseStoryIntentOutput(raw, '', [])).toMatchObject({ invalid: true, invalidReason: 'protocol_incomplete', content: '正文' });
});
it('does not accept a later valid envelope after a malformed first envelope', () => {
  const raw = `正文\n<story-intent broken>private\n<story-intent>${JSON.stringify(value)}</story-intent>`;
  expect(storyIntentVisiblePrefix(raw, true)).toBe('正文');
  expect(parseStoryIntentOutput(raw, '', [])).toMatchObject({ invalid: true, invalidReason: 'protocol_incomplete', content: '正文' });
});
