import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../../db';
import { chats, messages, type Chat } from '../../db/schema/chats';
import { storyEvents, storyNotes, storyStates } from '../../db/schema/story-state';
import { storyIntentPresentation } from '../../types/story-intent';
import { storyRulesSchema } from '../../types/story-state';
import type { StoryContentSnapshot } from '../../types/story-content';
import { commitStoryTurn, prepareStoryTurn } from './story-state.service';
import { loadStoryContent } from './story-content.service';

vi.mock('../../db', () => ({ db: {} }));
vi.mock('./story-content.service', () => ({ loadStoryContent: vi.fn() }));

const rules = storyRulesSchema.parse({ version: 1,
  fields: [{ id: 'coins', label: '金币', type: 'number', initial: 100, min: 0 }],
  actions: [{ id: 'pay', label: '支付20金币', intent: 'act', once: true,
    requires: [{ field: 'coins', operator: 'gte', value: 20 }],
    changes: [{ field: 'coins', operation: 'add', value: -20 }], outcome: '收到通行证' }],
});
const input = '我付钱买这张通行证。';
const intent = { version: 1, disposition: 'execution', steps: [{ kind: 'execute', actionId: 'pay', evidence: '付钱买' }], facts: [] };
const recommendations = [{ label: '查看通行证', input: '我看看通行证' }, { label: '询问守卫', input: '我询问守卫' }, { label: '暂时等候', input: '我先等一会儿' }];
const output = (value: unknown = intent) => `守卫递给你通行证。\n<story-intent>${JSON.stringify({ ...value as object, recommendations })}</story-intent>`;

// Single-story transactional stand-in: exercise the real prepare/commit functions,
// including their version, input and idempotency checks without touching user data.
function databaseFixture() {
  const chat = { id: 'chat', userId: 'owner', contentSnapshotVersion: 1 } as Chat;
  let state = { chatId: chat.id, version: 0, values: { coins: 100 }, completedActions: [] as string[], sources: {} };
  const replies: Array<Record<string, any>> = [];
  const events: Array<Record<string, any>> = [];
  let savedInput = input;
  const transaction = {
    select: () => {
      let table: unknown;
      const query: Record<string, any> = {};
      for (const method of ['where', 'for', 'orderBy', 'limit', 'leftJoin']) query[method] = () => query;
      query.from = (value: unknown) => { table = value; return query; };
      query.then = (resolve: (rows: unknown[]) => unknown) => Promise.resolve(table === chats ? [chat]
        : table === storyStates ? [state] : table === storyNotes ? [] : table === storyEvents ? events
          : replies.length ? replies : [{ id: 2, content: savedInput, extra: null }]).then(resolve);
      return query;
    },
    insert: (table: unknown) => ({ values: (value: Record<string, unknown>) => ({ returning: async () => {
      const row = table === messages ? { id: 3, ...value } : { id: 'event-1', ...value };
      (table === messages ? replies : events).push(row); return [row];
    } }) }),
    update: () => ({ set: (value: typeof state) => ({ where: async () => { state = { ...state, ...value }; } }) }),
  };
  const database = { transaction: async (run: (tx: unknown) => unknown) => run(transaction) } as unknown as Database;
  return { chat, database, replies, events, state: () => state, setInput: (value: string) => { savedInput = value; } };
}

beforeEach(() => {
  vi.mocked(loadStoryContent).mockResolvedValue({ characters: [{ id: 'character', cardData: {
    extensions: { squaretable: { exploration: rules } },
  } }] } as unknown as StoryContentSnapshot);
});

describe('direct single-player turns', () => {
  it('prepares a direct prompt and executes a paraphrased authored action in one request', async () => {
    const f = databaseFixture();
    const turn = (await prepareStoryTurn(f.chat, input, undefined, f.database))!;
    expect(turn.directResponse).toBe(true);
    expect(turn.prompt).toContain('[Direct story turn protocol]');
    expect(turn.prompt).not.toContain('[Action interpretation protocol');
    const reply = await commitStoryTurn(turn, 2, 'request', output(), false, f.database);
    expect(reply.content).toBe('守卫递给你通行证。');
    expect(reply.extra).toMatchObject({ stateStatus: 'confirmed', storyExecutedIntent: intent, storyRecommendations: recommendations });
    expect(reply.extra).not.toHaveProperty('storyIntent');
    expect(f.state()).toMatchObject({ version: 1, values: { coins: 80 }, completedActions: ['pay'], sources: { coins: 'event-1' } });
    expect(f.events[0]).toMatchObject({ actionId: 'pay', outcome: '收到通行证', changes: { coins: { before: 100, after: 80 } } });
    const duplicate = await commitStoryTurn(turn, 2, 'request', output(), false, f.database);
    expect(duplicate).toEqual(reply);
    expect(f.replies).toHaveLength(1);
    expect(f.state().values.coins).toBe(80);
  });

  it.each(['proposal', 'unknown-id', 'evidence', 'malformed', 'missing-protocol', 'resource', 'interrupted'])(
    'never commits consequences or facts on %s', async failure => {
      const f = databaseFixture();
      const turn = (await prepareStoryTurn(f.chat, input, undefined, f.database))!;
      let raw = output();
      if (failure === 'proposal') raw = output({ ...intent, disposition: 'proposal' });
      if (failure === 'unknown-id') raw = output({ ...intent, steps: [{ kind: 'execute', actionId: 'invented', evidence: '付钱买' }] });
      if (failure === 'evidence') raw = output({ ...intent, steps: [{ kind: 'execute', actionId: 'pay', evidence: '不存在的输入' }] });
      if (failure === 'malformed') raw = '未验证结果\n<story-intent>{broken';
      if (failure === 'missing-protocol') raw = '未验证结果';
      // Simulate an obsolete prepared menu; rechecking must catch the changed precondition.
      if (failure === 'resource') { turn.values = { coins: 5 }; turn.nextValues = turn.values; }
      const reply = await commitStoryTurn(turn, 2, 'request', raw, failure === 'interrupted', f.database);
      expect(reply.extra).toMatchObject({ stateStatus: 'interrupted' });
      expect(reply.extra).not.toHaveProperty('storyExecutedIntent');
      expect(reply.extra).not.toHaveProperty('storyFacts');
      expect(f.state().values).toEqual({ coins: 100 });
      expect(f.state().completedActions).toEqual([]);
      expect(f.events[0].changes).toEqual({});
      expect(f.events[0].actionId).toBeNull();
      expect(reply.content).not.toContain('请核对下面的行动理解');
    },
  );

  it('answers a question directly without spending or presenting approval', async () => {
    const f = databaseFixture();
    const turn = (await prepareStoryTurn(f.chat, input, undefined, f.database))!;
    const reply = await commitStoryTurn(turn, 2, 'request', output({ version: 1, disposition: 'expression', steps: [], facts: [] }), false, f.database);
    expect(reply.extra).toMatchObject({ stateStatus: 'confirmed' });
    expect(reply.extra).not.toHaveProperty('storyIntent');
    expect(f.state().values.coins).toBe(100);
  });

  it('does not execute an already selected rule twice', async () => {
    const f = databaseFixture(); f.setInput('支付20金币');
    const turn = (await prepareStoryTurn(f.chat, '支付20金币', { actionId: 'pay', expectedVersion: 0 }, f.database))!;
    await commitStoryTurn(turn, 2, 'request', output({ version: 1, disposition: 'expression', steps: [], facts: [] }), false, f.database);
    expect(f.state().values.coins).toBe(80);
    expect(f.state().completedActions).toEqual(['pay']);
  });

  it('rejects a changed saved input before writing', async () => {
    const f = databaseFixture();
    const turn = (await prepareStoryTurn(f.chat, input, undefined, f.database))!;
    f.setInput('先别付钱');
    await expect(commitStoryTurn(turn, 2, 'request', output(), false, f.database)).rejects.toMatchObject({ code: 'STORY_SOURCE_UNAVAILABLE' });
    expect(f.replies).toEqual([]);
  });
});


describe('model handoff validation and persistence', () => {
  it.each(['valid', 'ungrounded', 'unavailable', 'syntax', 'interrupted'])(
    'normalizes presentation punctuation while preserving %s transaction boundaries', async scenario => {
      const f = databaseFixture();
      const turn = (await prepareStoryTurn(f.chat, input, undefined, f.database))!;
      let raw = output().replace('</story-intent>', '。</story-intent>');
      if (scenario === 'ungrounded') raw = raw.replace('付钱买', '从未说过的行动');
      if (scenario === 'unavailable') raw = raw.replace('"actionId":"pay"', '"actionId":"invented"');
      if (scenario === 'syntax') raw = raw.replace('"version":1,', '"version":1 ');
      const reply = await commitStoryTurn(turn, 2, 'punctuation', raw, scenario === 'interrupted', f.database, undefined, raw,
        { model: 'test-model', finishReason: scenario === 'interrupted' ? 'length' : 'stop' });
      if (scenario === 'valid') {
        expect(reply.extra).toMatchObject({ stateStatus: 'confirmed', storyDiagnostics: { warnings: ['trailing_punctuation_removed'] } });
        expect(reply.extra?.storyRecommendations).toHaveLength(3);
        const duplicate = await commitStoryTurn(turn, 2, 'punctuation', raw, false, f.database);
        expect(duplicate).toEqual(reply);
        expect(f.replies).toHaveLength(1);
        expect(f.events).toHaveLength(1);
        expect(f.state().values.coins).toBe(80);
      } else {
        expect(reply.extra).toMatchObject({ stateStatus: 'interrupted' });
        for (const key of ['storyExecutedIntent', 'storyFacts', 'storyRecommendations']) expect(reply.extra).not.toHaveProperty(key);
        expect(f.state().values.coins).toBe(100);
        expect(f.events[0]).toMatchObject({ changes: {}, actionId: null });
      }
    });

  it('normalizes trailing separators without changing action authority and commits once', async () => {
    const f = databaseFixture(); const turn = (await prepareStoryTurn(f.chat, input, undefined, f.database))!;
    const raw = output().replace('}</story-intent>', ',}</story-intent>');
    const reply = await commitStoryTurn(turn, 2, 'trailing-comma', raw, false, f.database, undefined, raw, { finishReason: 'stop' });
    expect(reply.extra).toMatchObject({ stateStatus: 'confirmed', storyDiagnostics: { warnings: ['trailing_commas_removed'] } });
    expect(f.state().values.coins).toBe(80);
    await commitStoryTurn(turn, 2, 'trailing-comma', raw, false, f.database);
    expect(f.events).toHaveLength(1); expect(f.state().values.coins).toBe(80);
  });

  it('rejects duplicate action fields rather than using the last value', async () => {
    const f = databaseFixture(); const turn = (await prepareStoryTurn(f.chat, input, undefined, f.database))!;
    const raw = output().replace('"actionId":"pay"', '"actionId":"invented","actionId":"pay"');
    const reply = await commitStoryTurn(turn, 2, 'duplicate-key', raw, false, f.database);
    expect(reply.extra).toMatchObject({ stateStatus: 'interrupted', storyIntentInvalid: true, storyDiagnostics: { jsonFailure: { kind: 'duplicate_key' } } });
    expect(f.state().values.coins).toBe(100); expect(reply.extra).not.toHaveProperty('storyRecommendations');
  });

  it.each(['length', 'content_filter', 'tool_calls', 'other'] as const)('refuses state changes on %s even if a caller forgot the interrupted flag', async finishReason => {
    const f = databaseFixture(); const turn = (await prepareStoryTurn(f.chat, input, undefined, f.database))!;
    const raw = output();
    const reply = await commitStoryTurn(turn, 2, 'non-success', raw, false, f.database, undefined, raw, { finishReason });
    expect(reply.extra).toMatchObject({ stateStatus: 'interrupted', storyDiagnostics: { validation: 'interrupted' } });
    expect(f.state().values.coins).toBe(100); expect(f.events[0].changes).toEqual({});
    for (const key of ['storyExecutedIntent', 'storyFacts', 'storyRecommendations']) expect(reply.extra).not.toHaveProperty(key);
  });

  it('normalizes one extra object closer, persists its warning and executes a rule only once', async () => {
    const f = databaseFixture();
    const turn = (await prepareStoryTurn(f.chat, input, undefined, f.database))!;
    const raw = output().replace('</story-intent>', '}</story-intent>');
    const reply = await commitStoryTurn(turn, 2, 'extra-closer', raw, false, f.database, undefined, raw, { model: 'test-model', finishReason: 'stop' });
    expect(reply.extra).toMatchObject({ stateStatus: 'confirmed', storyDiagnostics: {
      validation: 'passed', warnings: ['redundant_closer_removed'],
    } });
    expect(f.state()).toMatchObject({ version: 1, values: { coins: 80 }, completedActions: ['pay'] });
    const duplicate = await commitStoryTurn(turn, 2, 'extra-closer', raw, false, f.database);
    expect(duplicate).toEqual(reply);
    expect(f.replies).toHaveLength(1);
    expect(f.events).toHaveLength(1);
    expect(f.state().values.coins).toBe(80);
  });

  it.each(['syntax', 'ungrounded', 'unavailable'] as const)('does not commit %s authority despite an extra root closer', async failure => {
    const f = databaseFixture();
    const turn = (await prepareStoryTurn(f.chat, input, undefined, f.database))!;
    let raw = output().replace('</story-intent>', '}</story-intent>');
    if (failure === 'syntax') raw = raw.replace('"version":1,', '"version":1 ');
    if (failure === 'ungrounded') raw = raw.replace('付钱买', '从未说过的行动');
    if (failure === 'unavailable') raw = raw.replace('"actionId":"pay"', '"actionId":"invented"');
    const reply = await commitStoryTurn(turn, 2, 'rejected-tail', raw, false, f.database);
    expect(reply.extra).toMatchObject({ stateStatus: 'interrupted', storyIntentInvalid: true });
    for (const key of ['storyExecutedIntent', 'storyFacts', 'storyRecommendations']) expect(reply.extra).not.toHaveProperty(key);
    expect(f.state().values.coins).toBe(100);
    expect(f.state().completedActions).toEqual([]);
    expect(f.events[0]).toMatchObject({ status: 'interrupted', changes: {}, actionId: null });
  });

  it('refuses all consequences when transport is incomplete even if the caller passes interrupted:false', async () => {
    const f = databaseFixture();
    const turn = (await prepareStoryTurn(f.chat, input, undefined, f.database))!;
    const raw = output();
    const reply = await commitStoryTurn(turn, 2, 'incomplete-stream', raw, false, f.database, undefined, raw,
      { model: 'test-model', streamIncomplete: true });
    expect(reply.content).toBe('守卫递给你通行证。');
    expect(reply.extra).toMatchObject({ stateStatus: 'interrupted', storyDiagnostics: {
      validation: 'interrupted', code: 'stream_incomplete', streamIncomplete: true,
    } });
    for (const key of ['storyExecutedIntent', 'storyFacts', 'storyRecommendations']) expect(reply.extra).not.toHaveProperty(key);
    expect(f.state().values.coins).toBe(100);
    expect(f.state().completedActions).toEqual([]);
    expect(f.events[0]).toMatchObject({ status: 'interrupted', changes: {}, actionId: null });
  });

  it.each(['plain-model', 'fenced-model', 'bad-suggestions-model', 'redundant-quote-model'])('preserves authored action authority for %s', async model => {
    const f = databaseFixture();
    const turn = (await prepareStoryTurn(f.chat, input, undefined, f.database))!;
    let raw = output();
    if (model === 'fenced-model') raw = raw.replace('\n<story-intent>', '\r\n <story-intent>\n```json\n').replace('</story-intent>', '\n```\n</story-intent>');
    if (model === 'bad-suggestions-model') raw = output().replace(JSON.stringify(recommendations), '"invalid"');
    if (model === 'redundant-quote-model') raw = output().replace('</story-intent>', '"</story-intent>');
    const reply = await commitStoryTurn(turn, 2, 'model-turn', storyIntentPresentation(raw, input, ['pay'], false, true), false, f.database, undefined, raw, { model, finishReason: 'stop' });
    expect(reply.content).toBe('守卫递给你通行证。');
    expect(reply.extra).toMatchObject({ stateStatus: 'confirmed', storyDiagnostics: { version: 1, model, finishReason: 'stop', validation: 'passed' } });
    expect(f.state().values).toEqual({ coins: 80 });
    expect(reply.extra?.storyRecommendations).toHaveLength(3);
    if (model === 'redundant-quote-model') expect(reply.extra).toMatchObject({ storyDiagnostics: { warnings: ['redundant_quote_removed'] } });
    if (model === 'bad-suggestions-model') {
      expect(reply.extra).toMatchObject({ storyDiagnostics: { warnings: ['recommendations_fallback'] } });
      expect(reply.extra).not.toHaveProperty('storyIntentInvalid');
    }
  });
  it.each([
    ['unexpected_proposal', () => output({ ...intent, disposition: 'proposal' })],
    ['ungrounded_action', () => output({ ...intent, steps: [{ kind: 'execute', actionId: 'pay', evidence: 'never said' }] })],
    ['invalid_json', () => '未验证的正文\n<story-intent>{bad}</story-intent>'],
    ['protocol_incomplete', () => output() + 'private tail'],
    ['protocol_incomplete', () => output().replace('</story-intent>', '')],
    ['missing_protocol', () => '只有正文'],
    ['empty_narrative', () => output().slice(output().indexOf('<story-intent>'))],
    ['empty_narrative', () => ''],
  ] as const)('saves %s with the generating model and no state effects', async (code, makeOutput) => {
    const f = databaseFixture(); const turn = (await prepareStoryTurn(f.chat, input, undefined, f.database))!;
    const raw = makeOutput();
    const reply = await commitStoryTurn(turn, 2, 'failed-turn', raw, false, f.database, undefined, raw, { model: 'new-model', finishReason: 'stop' });
    expect(reply.extra).toMatchObject({ stateStatus: 'interrupted', storyIntentInvalid: true,
      storyDiagnostics: { validation: 'failed', code, model: 'new-model', finishReason: 'stop' } });
    expect(f.state().values).toEqual({ coins: 100 });
    expect(f.events[0].changes).toEqual({});
    if (code === 'invalid_json') expect(reply.extra?.storyDiagnostics).toMatchObject({ jsonFailure: { kind: 'expected_property', length: 5 } });
    if (code === 'protocol_incomplete') {
      expect(reply.extra?.storyDiagnostics).toMatchObject({ protocolFailure: {
        kind: raw.endsWith('private tail') ? 'trailing_content' : 'missing_close',
        trailingCharacters: raw.endsWith('private tail') ? 12 : 0,
      } });
      expect(JSON.stringify(reply.extra?.storyDiagnostics)).not.toContain('private tail');
      expect(reply.extra).not.toHaveProperty('storyRecommendations');
    }
    expect(JSON.stringify(reply.extra?.storyDiagnostics)).not.toContain('never said');
  });
  it('keeps a truncated reply provisional and records the provider output limit', async () => {
    const f = databaseFixture(); const turn = (await prepareStoryTurn(f.chat, input, undefined, f.database))!;
    const raw = output();
    const reply = await commitStoryTurn(turn, 2, 'truncated', raw, true, f.database, undefined, raw, { model: 'limited-model', finishReason: 'length' });
    expect(reply.extra).toMatchObject({ stateStatus: 'interrupted', storyDiagnostics: { validation: 'interrupted', code: 'output_truncated' } });
    expect(f.state().values.coins).toBe(100);
    expect(reply.extra).not.toHaveProperty('storyFacts');
  });
});
