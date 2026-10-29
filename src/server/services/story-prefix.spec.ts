import { describe, expect, it } from 'vitest';
import { reconstructStoryPrefix } from './story-prefix';
import type { StoryContentSnapshot } from '../../types/story-content';
import type { Message } from '../../db/schema/chats';
import type { storyEvents, storyStates } from '../../db/schema/story-state';
import { adapterArtifactSchema } from '../../types/story-adapter';
import { ritualIdentityEffect, ritualRules, ritualSourceDigest } from '../../types/story-ritual';
import { randomUUID } from 'node:crypto';

function fixture() {
  const content = { characters: [{ cardData: { extensions: { squaretable: { exploration: { version: 1,
    fields: [{ id: 'coins', label: '金币', type: 'number', initial: 100 }],
    actions: [{ id: 'pay', label: '支付', intent: 'act', changes: [{ field: 'coins', operation: 'add', value: -20 }], outcome: '支付成功' }],
  } } } } }] } as StoryContentSnapshot;
  const history = [{ id: 1, role: 'assistant', parentMessageId: null },
    { id: 2, role: 'user', content: '支付', parentMessageId: null },
    { id: 3, role: 'assistant', parentMessageId: null, extra: { storyVersion: 1, stateStatus: 'confirmed', storyRequestId: 'first' } },
    { id: 4, role: 'user', parentMessageId: null },
    { id: 5, role: 'assistant', parentMessageId: null, extra: { storyVersion: 2, stateStatus: 'confirmed', storyRequestId: 'second' } }] as Message[];
  const events = [{ id: 'event-1', version: 1, status: 'confirmed', inputMessageId: 2, messageId: 3, requestId: 'first', actionId: 'pay', changes: { coins: { before: 100, after: 80 } } },
    { id: 'event-2', version: 2, status: 'confirmed', inputMessageId: 4, messageId: 5, requestId: 'second', actionId: null, changes: {} }] as Array<typeof storyEvents.$inferSelect>;
  const state = { version: 2, values: { coins: 80 }, completedActions: ['pay'], sources: { coins: 'event-1' } } as typeof storyStates.$inferSelect;
  return { content, history, events, state };
}

function addProposal(sample: ReturnType<typeof fixture>) {
  const intent = sample.history[2].extra!.storyConfirmedIntent;
  const input = sample.history[1].content;
  for (const message of sample.history.slice(1)) {
    message.id += 2;
    if (message.role === 'assistant') message.extra!.storyVersion = Number(message.extra!.storyVersion) + 1;
  }
  for (const event of sample.events) {
    event.version++;
    event.inputMessageId! += 2;
    event.messageId! += 2;
  }
  sample.history.splice(1, 0, { id: 2, role: 'user', content: input, parentMessageId: null } as Message,
    { id: 3, role: 'assistant', parentMessageId: null, extra: { storyVersion: 1, stateStatus: 'proposed', storyRequestId: 'proposal',
      storyIntent: { intent: structuredClone(intent), input, expectedVersion: 1 } } } as Message);
  sample.events.unshift({ id: 'proposal', version: 1, status: 'proposed', inputMessageId: 2, messageId: 3,
    requestId: 'proposal', actionId: null, changes: {} } as typeof storyEvents.$inferSelect);
  sample.state.version++;
}

function proposalFixture() {
  const sample = fixture();
  sample.history[1].content = '我想支付';
  sample.history[2].extra = { ...sample.history[2].extra, storyConfirmedIntent: { version: 1, disposition: 'proposal',
    steps: [{ kind: 'execute', actionId: 'pay', evidence: '支付' }], facts: [] } };
  addProposal(sample);
  return sample;
}

describe('verified independent story prefix', () => {
  it('replays the identity claim from original input and does not copy the future claim into an earlier branch', () => {
    const sample = fixture();
    sample.content.characters[0].cardData = {};
    sample.content.characters[0].adaptation = adapterArtifactSchema.parse({ version: 1, compiler: 'finite-rules-v1',
      jobId: randomUUID(), characterId: randomUUID(), sourceRevision: 'a'.repeat(64), conclusion: 'supported', reason: 'reviewed-ritual',
      turnEffect: ritualIdentityEffect, rules: ritualRules(ritualIdentityEffect), sources: [{ bookId: randomUUID(), entryIndex: 2, digest: ritualSourceDigest }] });
    sample.history[1].content = '我不是鸟神';
    sample.history[3].content = '我是鸟神';
    sample.events[0].actionId = null;
    sample.events[0].changes = { 'kakaa-strength': { before: 0, after: 3 } };
    sample.events[1].changes = { 'kakaa-strength': { before: 3, after: 6 }, 'kakaa-identity-claim': { before: false, after: true } };
    sample.state.values = { 'kakaa-strength': 6, 'kakaa-identity-claim': true };
    sample.state.completedActions = [];
    sample.state.sources = { 'kakaa-strength': 'event-2', 'kakaa-identity-claim': 'event-2' };
    expect(reconstructStoryPrefix(sample.content, sample.history, sample.events, sample.state, 1).values).toEqual({ 'kakaa-strength': 3, 'kakaa-identity-claim': false });
    expect(reconstructStoryPrefix(sample.content, sample.history, sample.events, sample.state, 2).values).toEqual(sample.state.values);
    sample.history[3].content = '如果我是鸟神';
    expect(() => reconstructStoryPrefix(sample.content, sample.history, sample.events, sample.state, 1)).toThrow();
  });
  it('replays reviewed end-of-turn effects only for confirmed turns and rejects forged increments', () => {
    const sample = fixture();
    sample.content.characters[0].cardData = {};
    sample.content.characters[0].adaptation = adapterArtifactSchema.parse({ version: 1, compiler: 'finite-rules-v1',
      jobId: randomUUID(), characterId: randomUUID(), sourceRevision: 'a'.repeat(64), conclusion: 'supported', reason: 'reviewed-ritual',
      turnEffect: 'kakaa-ritual-v1', rules: ritualRules(), sources: [{ bookId: randomUUID(), entryIndex: 2, digest: ritualSourceDigest }] });
    sample.events[0].actionId = null;
    sample.events[0].changes = { 'kakaa-strength': { before: 0, after: 3 } };
    sample.events[1].changes = { 'kakaa-strength': { before: 3, after: 6 } };
    sample.state.values = { 'kakaa-strength': 6 };
    sample.state.completedActions = [];
    sample.state.sources = { 'kakaa-strength': 'event-2' };
    expect(reconstructStoryPrefix(sample.content, sample.history, sample.events, sample.state, 1).values).toEqual({ 'kakaa-strength': 3 });
    for (const status of ['interrupted', 'proposed'] as const) {
      sample.events[1].status = status;
      sample.history[4].extra!.stateStatus = status;
      sample.events[1].changes = {};
      sample.state.values = { 'kakaa-strength': 3 };
      sample.state.sources = { 'kakaa-strength': 'event-1' };
      expect(reconstructStoryPrefix(sample.content, sample.history, sample.events, sample.state, 1).values).toEqual({ 'kakaa-strength': 3 });
      expect(() => reconstructStoryPrefix(sample.content, sample.history, sample.events, sample.state, 2)).toThrow();
    }
    sample.events[0].changes['kakaa-strength'].after = 9;
    expect(() => reconstructStoryPrefix(sample.content, sample.history, sample.events, sample.state, 1)).toThrow();
  });
  it('reconstructs initial and intermediate values without copying later history', () => {
    const { content, history, events, state } = fixture();
    const initial = reconstructStoryPrefix(content, history, events, state, 0);
    expect(initial.values).toEqual({ coins: 100 });
    expect(initial.history.map(message => message.id)).toEqual([1]);
    const middle = reconstructStoryPrefix(content, history, events, state, 1);
    expect(middle.values).toEqual({ coins: 80 });
    expect(middle.history.map(message => message.id)).toEqual([1, 2, 3]);
    expect(middle.sources).toEqual({ coins: 'event-1' });
  });
  it.each(['state', 'changes', 'request', 'audience', 'orphan', 'legacy', 'version', 'chronology', 'boundary'])('rejects corrupt %s rather than inventing restored state', kind => {
    const sample = fixture();
    let through = 1;
    if (kind === 'state') sample.state.values.coins = 500;
    if (kind === 'changes') sample.events[0].changes.coins.after = 90;
    if (kind === 'request') sample.events[0].requestId = 'forged';
    if (kind === 'audience') sample.history[2].extra = { ...sample.history[2].extra, storyAudience: ['someone'] };
    if (kind === 'orphan') sample.history.push({ id: 6, role: 'user', parentMessageId: null } as Message);
    if (kind === 'legacy') sample.history[2].parentMessageId = 1;
    if (kind === 'version') sample.events[0].version = 3;
    if (kind === 'chronology') sample.events[1].inputMessageId = 2;
    if (kind === 'boundary') through = -1;
    if (kind === 'chronology') through = 1;
    expect(() => reconstructStoryPrefix(sample.content, sample.history, sample.events, sample.state, through)).toThrow();
  });
  it('allows a complete shared-input group but refuses a partial group boundary', () => {
    const sample = fixture();
    sample.history.splice(3, 1);
    sample.events[1].inputMessageId = 2;
    expect(() => reconstructStoryPrefix(sample.content, sample.history, sample.events, sample.state, 1)).toThrow();
    expect(reconstructStoryPrefix(sample.content, sample.history, sample.events, sample.state, 2).history).toHaveLength(4);
  });
  it('replays every explicitly confirmed action in a compound turn', () => {
    const sample = fixture();
    const rules = sample.content.characters[0].cardData.extensions!.squaretable as { exploration: { actions: unknown[] } };
    rules.exploration.actions.push({ id: 'earn', label: '收款', intent: 'act', changes: [{ field: 'coins', operation: 'add', value: 5 }], outcome: '收到5枚' });
    sample.history[1].content = '支付然后收款';
    sample.history[2].extra = { ...sample.history[2].extra, storyConfirmedIntent: { version: 1, disposition: 'proposal', steps: [
      { kind: 'execute', actionId: 'pay', evidence: '支付' }, { kind: 'execute', actionId: 'earn', evidence: '收款' },
    ], facts: [] } };
    sample.events[0].changes.coins.after = 85;
    sample.state.values.coins = 85;
    sample.state.completedActions = ['pay', 'earn'];
    addProposal(sample);
    expect(reconstructStoryPrefix(sample.content, sample.history, sample.events, sample.state, 2).values).toEqual({ coins: 85 });
    sample.state.values.coins = 80;
    expect(() => reconstructStoryPrefix(sample.content, sample.history, sample.events, sample.state, 2)).toThrow();
  });
  it.each(['先别支付', '听说可以支付', '询问价格'])('rejects a transaction whose original input is %s', input => {
    const sample = fixture();
    sample.history[1].content = input;
    expect(() => reconstructStoryPrefix(sample.content, sample.history, sample.events, sample.state, 1)).toThrow();
  });
  it('accepts an exact authored alias with surrounding whitespace', () => {
    const sample = fixture();
    const rules = sample.content.characters[0].cardData.extensions!.squaretable as { exploration: { actions: Array<{ aliases?: string[] }> } };
    rules.exploration.actions[0].aliases = ['交钱'];
    sample.history[1].content = ' 交钱\n';
    expect(reconstructStoryPrefix(sample.content, sample.history, sample.events, sample.state, 1).values.coins).toBe(80);
  });
  it('replays a paraphrased transaction only after its original proposal is confirmed', () => {
    const sample = proposalFixture();
    expect(reconstructStoryPrefix(sample.content, sample.history, sample.events, sample.state, 2).values.coins).toBe(80);
    expect(() => reconstructStoryPrefix(sample.content, sample.history, sample.events, sample.state, 1)).toThrow();
  });
  it.each(['evidence', 'proposal-input', 'confirmation-input', 'proposal-version', 'proposal-intent', 'proposal-status', 'proposal-missing', 'action-missing'])('rejects inconsistent transaction proof: %s', kind => {
    const sample = proposalFixture();
    const proposed = sample.history[2].extra!.storyIntent as { expectedVersion: number; input: string; intent: { steps: Array<{ evidence: string }> } };
    if (kind === 'evidence') {
      proposed.intent.steps[0].evidence = '收款';
      sample.history[4].extra!.storyConfirmedIntent = structuredClone(proposed.intent);
    }
    if (kind === 'proposal-input') sample.history[1].content = '先别支付';
    if (kind === 'confirmation-input') sample.history[3].content = '先别支付';
    if (kind === 'proposal-version') proposed.expectedVersion = 0;
    if (kind === 'proposal-intent') proposed.intent.steps[0].evidence = '想支付';
    if (kind === 'proposal-status') {
      sample.events[0].status = 'interrupted';
      sample.history[2].extra!.stateStatus = 'interrupted';
    }
    if (kind === 'proposal-missing') delete sample.history[2].extra!.storyIntent;
    if (kind === 'action-missing') sample.events[1].actionId = null;
    expect(() => reconstructStoryPrefix(sample.content, sample.history, sample.events, sample.state, 2)).toThrow();
  });
  it.each(['missing-evidence', 'wrong-disposition', 'missing-action'])('rejects corrupt confirmed action interpretation: %s', kind => {
    const sample = fixture();
    sample.history[2].extra = { ...sample.history[2].extra, storyConfirmedIntent: {
      version: 1, disposition: kind === 'wrong-disposition' ? 'expression' : 'proposal', steps: [
        { kind: 'explore', intent: 'observe', description: '问价', evidence: '问价' },
      ], facts: [],
    } };
    sample.history[1].content = kind === 'missing-evidence' ? '支付' : '问价';
    if (kind === 'missing-action') sample.events[0].actionId = null;
    if (kind === 'wrong-disposition') {
      sample.events[0].actionId = null;
      sample.events[0].changes = {};
      sample.state.values.coins = 100;
      sample.state.completedActions = [];
      sample.state.sources = {};
    }
    expect(() => reconstructStoryPrefix(sample.content, sample.history, sample.events, sample.state, 1)).toThrow();
  });
});
