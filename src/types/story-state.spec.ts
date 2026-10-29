import { describe, it, expect } from 'vitest';
import { storyExamples } from './story-examples';
import { getStoryRules, availableStoryActions, applyStoryAction, matchesStoryConditions, storyRulesSchema } from './story-state';

describe('authored exploration rules', () => {
  const rules = getStoryRules(storyExamples[0].cardData)!;
  const initial = Object.fromEntries(rules.fields.map(field => [field.id, field.initial]));
  it('preserves unknown information and hides undiscovered clues', () => {
    expect(initial.source).toBeNull();
    expect(matchesStoryConditions(rules.fields.find(field => field.id === 'seal')!.visibleWhen, initial)).toBe(false);
  });
  it('does not offer travel before a required permit', () => {
    expect(availableStoryActions(rules, initial, []).map(action => action.id)).not.toContain('go-lighthouse');
  });
  it('spends resources only once and then unlocks travel', () => {
    const purchase = rules.actions.find(action => action.id === 'permit')!;
    const after = applyStoryAction(rules, purchase, initial);
    expect(initial.coins).toBe(120);
    expect(after.coins).toBe(100);
    expect(availableStoryActions(rules, after, ['permit']).map(action => action.id)).toContain('go-lighthouse');
    expect(availableStoryActions(rules, after, ['permit']).map(action => action.id)).not.toContain('permit');
  });
  it('rejects unknown balances and insufficient funds', () => {
    const purchase = rules.actions.find(action => action.id === 'permit')!;
    expect(() => applyStoryAction(rules, purchase, { ...initial, coins: null })).toThrow();
    expect(() => applyStoryAction(rules, purchase, { ...initial, coins: 10 })).toThrow();
    expect(availableStoryActions(rules, { ...initial, coins: 10 }, []).map(action => action.id)).not.toContain('permit');
  });
  it('rejects teleportation across disconnected map nodes', () => {
    const disconnected = storyRulesSchema.parse({ ...rules, map: { ...rules.map, nodes: rules.map!.nodes.map(node => ({ ...node, links: [] })) } });
    expect(() => applyStoryAction(disconnected, rules.actions.find(action => action.id === 'go-lighthouse')!, initial)).toThrow('No route');
  });
  it('rejects ambiguous aliases, invalid references and unsafe identifiers', () => {
    expect(() => storyRulesSchema.parse({ ...rules, actions: [...rules.actions, rules.actions[0]] })).toThrow();
    expect(() => storyRulesSchema.parse({ fields: [{ id: '__proto__', type: 'number', label: 'bad', initial: 0 }], version: 1 })).toThrow();
  });
  it('supports a relationship story without inventing a map or affection score', () => {
    const relationship = getStoryRules(storyExamples[1].cardData)!;
    expect(relationship.map).toBeUndefined();
    expect(relationship.fields.every(field => field.type !== 'number')).toBe(true);
  });
  it('does not infer a native protocol from arbitrary third party extensions', () => {
    expect(getStoryRules({ extensions: { tavern_helper: { scripts: ['script'] }, arbitrary: true } })).toBeNull();
  });
  it.each([
    { field: 'coins', operator: 'eq', value: '120' },
    { field: 'coins', operator: 'gte', value: null },
    { field: 'seal', operator: 'lte', value: 1 },
  ])('rejects author conditions with mismatched types: %j', condition => {
    expect(() => storyRulesSchema.parse({ ...rules, actions: [{ ...rules.actions[0], requires: [condition] }] })).toThrow();
  });
  it('accepts explicit unknown equality checks and rejects nonnumeric or infinite bounds', () => {
    expect(storyRulesSchema.safeParse({ ...rules, actions: [{ ...rules.actions[0], requires: [{ field: 'source', operator: 'eq', value: null }] }] }).success).toBe(true);
    expect(storyRulesSchema.safeParse({ version: 1, fields: [{ id: 'name', label: 'Name', type: 'string', initial: null, min: 0 }] }).success).toBe(false);
    expect(storyRulesSchema.safeParse({ version: 1, fields: [{ id: 'coins', label: 'Coins', type: 'number', initial: 0, max: Infinity }] }).success).toBe(false);
  });
  it('keeps previously captured rules readable without accepting them as new author configuration', () => {
    const exploration = { ...rules, actions: [{ ...rules.actions[0], requires: [{ field: 'coins', operator: 'eq', value: '120' }] }] };
    const card = { extensions: { squaretable: { exploration } } };
    expect(() => getStoryRules(card)).toThrow();
    expect(getStoryRules(card, 'snapshot')?.actions[0].requires[0].value).toBe('120');
  });
});
