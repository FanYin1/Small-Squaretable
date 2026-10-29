import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateTransferredState } from './story-transfer-state.mjs';
import { ritualIdentityEffect, ritualRules } from '../src/types/story-ritual.ts';

function fixture() {
  return {
    content: { characters: [{ cardData: {}, adaptation: { rules: ritualRules(), turnEffect: 'kakaa-ritual-v1' } }] },
    events: [
      { id: 'first', version: 1, request_id: 'request1', message_id: 2, status: 'confirmed', action_id: null, changes: { 'kakaa-strength': { before: 0, after: 3 } } },
      { id: 'second', version: 2, request_id: 'request2', message_id: 4, status: 'interrupted', action_id: null, changes: {} },
    ],
    messages: [{ id: 2, role: 'assistant' }, { id: 4, role: 'assistant' }],
    state: { version: 2, values: { 'kakaa-strength': 3 }, completed_actions: [], sources: { 'kakaa-strength': 'first' } },
  };
}
const validate = sample => validateTransferredState(sample.content, sample.events, sample.messages, sample.state);

function identityFixture() {
  const sample = fixture();
  sample.content.characters[0].adaptation = { rules: ritualRules(ritualIdentityEffect), turnEffect: ritualIdentityEffect };
  sample.events[0].input_message_id = 1;
  sample.events[0].changes['kakaa-identity-claim'] = { before: false, after: true };
  sample.messages.unshift({ id: 1, role: 'user', content: '我是鸟神' });
  sample.state.values['kakaa-identity-claim'] = true;
  sample.state.sources['kakaa-identity-claim'] = 'first';
  return sample;
}

test('replays the frozen identity condition from the actual user message', () => validate(identityFixture()));

for (const [name, mutate] of Object.entries({
  missingInput: sample => { sample.messages.shift(); },
  foreignRole: sample => { sample.messages[0].role = 'assistant'; },
  negativeInput: sample => { sample.messages[0].content = '我不是鸟神'; },
  quotedInput: sample => { sample.messages[0].content = '“我是鸟神”'; },
  hypotheticalInput: sample => { sample.messages[0].content = '如果我是鸟神'; },
})) test(`rejects identity condition with ${name}`, () => {
  const sample = identityFixture(); mutate(sample);
  assert.throws(() => validate(sample));
});

test('replays frozen counter in version order without mutating export or counting interruption/proposal', () => {
  for (const status of ['interrupted', 'proposed']) {
    const sample = fixture();
    sample.events[1].status = status;
    sample.events.reverse();
    const before = structuredClone(sample);
    validate(sample);
    assert.deepEqual(sample, before);
  }
});

for (const [name, mutate] of Object.entries({
  value: sample => { sample.state.values['kakaa-strength'] = 300; },
  delta: sample => { sample.events[0].changes['kakaa-strength'].after = 300; sample.state.values['kakaa-strength'] = 300; },
  source: sample => { sample.state.sources['kakaa-strength'] = 'second'; },
  completion: sample => { sample.state.completed_actions = ['invented']; },
  unknownField: sample => { sample.state.values.coins = 500; },
  initial: sample => { sample.events = []; sample.state.version = 0; },
  unknownAction: sample => { sample.events[0].action_id = 'invented'; },
  duplicateRequest: sample => { sample.events[1].request_id = sample.events[0].request_id; },
  duplicateReply: sample => { sample.events[1].message_id = sample.events[0].message_id; },
  nonIntegerVersion: sample => { sample.events[1].version = 1.5; },
  interruptedDelta: sample => { sample.events[1].changes = { 'kakaa-strength': { before: 3, after: 6 } }; sample.state.values['kakaa-strength'] = 6; },
})) test(`rejects ${name} rather than trusting self-consistent stored values`, () => {
  const sample = fixture(); mutate(sample);
  assert.throws(() => validate(sample));
});

test('replays compound conditional/once actions and rejects repeated one-time action', () => {
  const sample = fixture();
  sample.content.characters[0].adaptation = undefined;
  sample.content.characters[0].cardData = { extensions: { squaretable: { exploration: { version: 1,
    fields: [{ id: 'coins', label: 'Coins', type: 'number', initial: 10 }], actions: [
      { id: 'pay', label: 'Pay', intent: 'act', once: true, requires: [{ field: 'coins', operator: 'gte', value: 3 }], changes: [{ field: 'coins', operation: 'add', value: -3 }], outcome: 'Paid' },
      { id: 'set', label: 'Set', intent: 'act', changes: [{ field: 'coins', operation: 'set', value: 5 }], outcome: 'Set' },
    ],
  } } } };
  sample.events[0].action_id = 'pay';
  sample.events[0].changes = { coins: { before: 10, after: 5 } };
  sample.messages[0].extra = { storyConfirmedIntent: { version: 1, disposition: 'proposal', steps: [
    { kind: 'execute', actionId: 'pay', evidence: 'Pay' }, { kind: 'execute', actionId: 'set', evidence: 'Set' },
  ], facts: [] } };
  sample.state = { version: 2, values: { coins: 5 }, completed_actions: ['pay', 'set'], sources: { coins: 'first' } };
  validate(sample);
  sample.events[1].status = 'confirmed'; sample.events[1].action_id = 'pay';
  assert.throws(() => validate(sample), /Unavailable saved action/);
});

test('unadapted stories cannot import invented current state', () => {
  const sample = fixture();
  sample.content.characters[0].adaptation = undefined;
  sample.events[0].changes = {};
  sample.state.values = {}; sample.state.sources = {};
  validate(sample);
  sample.state.values.coins = 20;
  assert.throws(() => validate(sample));
});
