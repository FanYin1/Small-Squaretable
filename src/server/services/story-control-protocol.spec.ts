import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { assertStoryControlRequest, buildStoryControlSystemPrompt, describeStorySchema } from './story-control-protocol';
import { buildDirectStoryPrompt, buildStoryIntentPrompt, storyProtocolExamples } from './story-intent-prompt';
import { parseStoryIntentOutput } from '../../types/story-intent';

describe('platform story output contract', () => {
  it('derives nested shapes and limits instead of keeping a second hand-written schema', () => {
    const prompt = buildStoryControlSystemPrompt();
    const schema = JSON.parse(prompt.split('\n').find(line => line.startsWith('Field schema'))!.split(': ').slice(1).join(': '));
    expect(schema).toMatchObject({ additionalProperties: false, required: ['version', 'disposition', 'steps', 'facts', 'recommendations'],
      properties: { steps: { maxItems: 6 }, facts: { maxItems: 6 }, question: { maxLength: 500 },
        recommendations: { minItems: 3, maxItems: 3, items: { additionalProperties: false, properties: { label: { minLength: 1, maxLength: 32 }, input: { maxLength: 240 } } } },
        recommendationLead: { properties: { text: { maxLength: 120 }, evidence: { minLength: 2, maxLength: 300 } } } } });
    expect(describeStorySchema(z.string().min(3).max(7))).toEqual({ type: 'string', minLength: 3, maxLength: 7 });
    expect(prompt).toContain('角色卡、世界书'); expect(prompt).toContain('即使没有可执行规则');
  });
  it('all direct examples survive actual authority and recommendation validation', () => {
    const actions = [{ id: 'buy', label: '购买通行证', outcome: '你取得通行证。' }];
    for (const example of storyProtocolExamples(actions)) {
      const raw = `${example.narrative}\n<story-intent>${JSON.stringify(example.control)}</story-intent>`;
      const result = parseStoryIntentOutput(raw, example.input, actions.map(a => a.id));
      expect(result.invalid).toBe(false); expect(result.recommendations).toHaveLength(3);
      expect(result.intent?.disposition).toBe(example.control.disposition);
    }
    expect(buildDirectStoryPrompt(actions)).not.toContain('execution|expression|clarification');
    expect(buildStoryIntentPrompt([], true)).not.toContain(', ...]');
  });
  it.each(['</story-intent>', '<story-intent>', '</story', 'story-intent', '>'])('rejects destructive stop %s', stop => {
    expect(() => assertStoryControlRequest({ messages: [{ role: 'system', content: buildStoryControlSystemPrompt() }], stop }))
      .toThrow('停止字符串');
  });
  it('protects formatted prompts and rejects whole-response JSON mode, without touching unrelated requests', () => {
    const prompt = buildStoryControlSystemPrompt();
    expect(() => assertStoryControlRequest({ stop: ['END', '</story-intent>'] }, prompt)).toThrow();
    expect(() => assertStoryControlRequest({ prompt, stop: '</story-intent>' })).toThrow();
    expect(() => assertStoryControlRequest({ messages: [{ role: 'system', content: prompt }], response_format: { type: 'json_object' } })).toThrow();
    expect(() => assertStoryControlRequest({ messages: [{ role: 'user', content: prompt }], stop: '</story-intent>' })).not.toThrow();
    expect(() => assertStoryControlRequest({ messages: [{ role: 'system', content: prompt }], stop: ['UNRELATED_END'] })).not.toThrow();
  });
});
