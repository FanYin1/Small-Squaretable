import { describe, expect, it } from 'vitest';
import { resolveStoryExecution } from './story-execution';
import { storyIntentSchema } from './story-intent';
import { storyRulesSchema } from './story-state';

const rules = storyRulesSchema.parse({ version: 1,
  fields: [{ id: 'coins', label: '钱', type: 'number', initial: 30, min: 0 }],
  actions: ['first', 'second'].map(id => ({ id, label: id, intent: 'act', once: true,
    requires: [{ field: 'coins', operator: 'gte', value: 20 }],
    changes: [{ field: 'coins', operation: 'add', value: -20 }], outcome: '支付20' })),
});
const execution = (ids: string[]) => storyIntentSchema.parse({ version: 1, disposition: 'execution',
  steps: ids.map(actionId => ({ kind: 'execute', actionId, evidence: actionId })), facts: [] });

describe('authored direct action resolution', () => {
  it('rechecks every step with the result of the previous step without mutating the input', () => {
    const values = { coins: 30 };
    expect(() => resolveStoryExecution(rules, values, [], execution(['first', 'second']))).toThrow();
    expect(values).toEqual({ coins: 30 });
    expect(resolveStoryExecution(rules, { coins: 50 }, [], execution(['first', 'second'])).nextValues).toEqual({ coins: 10 });
  });
  it('rejects a completed once-only action', () => {
    expect(() => resolveStoryExecution(rules, { coins: 100 }, ['first'], execution(['first']))).toThrow();
  });
  it('does not give a free narrative action numeric authority', () => {
    const intent = storyIntentSchema.parse({ version: 1, disposition: 'execution', steps: [
      { kind: 'explore', intent: 'observe', description: '查看门边', evidence: '查看' },
    ], facts: [] });
    expect(resolveStoryExecution(null, {}, [], intent)).toEqual({ actions: [], nextValues: {} });
    expect(resolveStoryExecution(rules, { coins: 30 }, [], { ...intent, disposition: 'proposal' }).nextValues).toEqual({ coins: 30 });
  });
});
