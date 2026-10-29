import assert from 'node:assert/strict';
import { frozenStoryRules } from '../src/types/story-adapter.ts';
import { availableStoryActions, applyStoryAction } from '../src/types/story-state.ts';
import { applyRitualTurn } from '../src/types/story-ritual.ts';
import { storyIntentSchema } from '../src/types/story-intent.ts';

export function validateTransferredState(content, events, messages, state) {
  assert.ok(Number.isSafeInteger(state.version) && state.version >= 0, 'Invalid state version');
  assert.equal(events.length, state.version, 'Incomplete state history');
  const character = content.characters[0];
  const rules = character ? frozenStoryRules(character) : null;
  assert.ok(content.characters.length <= 1 || !rules, 'Unsupported multi-character rules');
  let values = Object.fromEntries((rules?.fields ?? []).map(field => [field.id, field.initial]));
  const completed = [];
  const sources = {};
  const requests = new Set();
  const replies = new Set();
  const byId = new Map(messages.map(message => [message.id, message]));
  for (const [index, event] of [...events].sort((left, right) => left.version - right.version).entries()) {
    assert.equal(event.version, index + 1, 'Invalid state event order');
    assert.ok(!requests.has(event.request_id) && !replies.has(event.message_id), 'Duplicate state event source');
    requests.add(event.request_id); replies.add(event.message_id);
    const reply = byId.get(event.message_id);
    assert.ok(reply?.role === 'assistant', 'Missing state event reply');
    let next = values;
    if (event.status === 'confirmed') {
      let actions = event.action_id ? [event.action_id] : [];
      if (reply.extra?.storyConfirmedIntent) {
        const intent = storyIntentSchema.parse(reply.extra.storyConfirmedIntent);
        actions = intent.steps.flatMap(step => step.kind === 'execute' ? [step.actionId] : []);
        assert.equal(actions[0] ?? null, event.action_id ?? null, 'Confirmed action mismatch');
      }
      for (const actionId of actions) {
        const action = availableStoryActions(rules, next, completed).find(item => item.id === actionId);
        assert.ok(rules && action, 'Unavailable saved action');
        next = applyStoryAction(rules, action, next);
        if (!completed.includes(actionId)) completed.push(actionId);
      }
      const input = byId.get(event.input_message_id);
      next = applyRitualTurn(character?.adaptation?.turnEffect, next, input?.role === 'user' ? input.content : undefined);
    } else assert.ok(['proposed', 'interrupted'].includes(event.status), 'Unknown state event status');
    const changes = Object.fromEntries(Object.entries(next).filter(([key, value]) => values[key] !== value)
      .map(([key, value]) => [key, { before: values[key], after: value }]));
    assert.deepEqual(event.changes, changes, 'Saved changes disagree with frozen rules');
    values = next;
    for (const key of Object.keys(changes)) sources[key] = event.id;
  }
  assert.deepEqual(state.values, values, 'Saved values disagree with frozen rules');
  assert.deepEqual(state.completed_actions, completed, 'Saved completed actions disagree with history');
  assert.deepEqual(state.sources, sources, 'Saved state sources disagree with history');
}
