import { z } from 'zod';

const identifier = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/).refine(value => !['constructor', 'prototype'].includes(value));
const scalar = z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]);
export type StoryValue = z.infer<typeof scalar>;
const conditionSchema = z.object({ field: identifier, operator: z.enum(['eq', 'ne', 'gte', 'lte']), value: scalar }).strict();
const fieldSchema = z.object({
  id: identifier, label: z.string().min(1).max(80), type: z.enum(['number', 'string', 'boolean']), initial: scalar,
  unit: z.string().max(20).optional(), min: z.number().optional(), max: z.number().optional(),
  visible: z.boolean().default(true), visibleWhen: z.array(conditionSchema).max(12).default([]),
}).strict();
const actionSchema = z.object({
  id: identifier, label: z.string().min(1).max(200), intent: z.enum(['observe', 'talk', 'act', 'travel']),
  aliases: z.array(z.string().min(1).max(200)).max(12).default([]),
  requires: z.array(conditionSchema).max(24).default([]), once: z.boolean().default(false),
  changes: z.array(z.object({ field: identifier, operation: z.enum(['set', 'add']), value: scalar }).strict()).max(24).default([]),
  outcome: z.string().min(1).max(3000),
}).strict();

const storedStoryRulesSchema = z.object({
  version: z.literal(1), summary: z.string().max(1000).optional(),
  fields: z.array(fieldSchema).max(64).default([]), actions: z.array(actionSchema).max(64).default([]),
  map: z.object({
    locationField: identifier,
    nodes: z.array(z.object({ id: identifier, label: z.string().min(1).max(80),
      description: z.string().max(500).optional(), links: z.array(identifier).max(32).default([]),
      visibleWhen: z.array(conditionSchema).max(12).default([]),
    }).strict()).max(64),
  }).strict().optional(),
}).strict().superRefine((rules, context) => {
  const fields = new Map(rules.fields.map(field => [field.id, field]));
  const invalid = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  if (fields.size !== rules.fields.length || new Set(rules.actions.map(action => action.id)).size !== rules.actions.length) invalid('Duplicate field or action ID');
  for (const field of rules.fields) {
    if (field.initial !== null && typeof field.initial !== field.type) invalid(`Initial type mismatch: ${field.id}`);
    if (typeof field.initial === 'number' && (field.initial < (field.min ?? -Infinity) || field.initial > (field.max ?? Infinity))) invalid(`Initial value out of bounds: ${field.id}`);
    if (field.min != null && field.max != null && field.min > field.max) invalid(`Invalid bounds: ${field.id}`);
  }
  const conditions = [...rules.fields.flatMap(field => field.visibleWhen), ...rules.actions.flatMap(action => action.requires), ...(rules.map?.nodes.flatMap(node => node.visibleWhen) ?? [])];
  for (const condition of conditions) if (!fields.has(condition.field)) invalid(`Unknown condition field: ${condition.field}`);
  for (const action of rules.actions) for (const change of action.changes) {
    const field = fields.get(change.field);
    if (!field) invalid(`Unknown changed field: ${change.field}`);
    else if (change.operation === 'add' ? field.type !== 'number' || typeof change.value !== 'number'
      : change.value !== null && typeof change.value !== field.type) invalid(`Invalid change type: ${change.field}`);
  }
  const labels = rules.actions.flatMap(action => [action.label, ...action.aliases]);
  if (new Set(labels).size !== labels.length) invalid('Ambiguous action labels or aliases');
  if (rules.map) {
    if (fields.get(rules.map.locationField)?.type !== 'string') invalid('Map location must be a string field');
    const ids = new Set(rules.map.nodes.map(node => node.id));
    if (ids.size !== rules.map.nodes.length) invalid('Duplicate map node ID');
    for (const node of rules.map.nodes) if (node.links.some(id => !ids.has(id))) invalid('Unknown map connection');
    const initial = fields.get(rules.map.locationField)?.initial;
    if (initial !== null && typeof initial === 'string' && !ids.has(initial)) invalid('Unknown initial map location');
  }
});

export const storyRulesSchema = storedStoryRulesSchema.superRefine((rules, context) => {
  const fields = new Map(rules.fields.map(field => [field.id, field]));
  const invalid = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  for (const field of rules.fields) {
    if (field.type !== 'number' && (field.min != null || field.max != null)) invalid(`Bounds require a number field: ${field.id}`);
    if ((field.min != null && !Number.isFinite(field.min)) || (field.max != null && !Number.isFinite(field.max))) invalid(`Bounds must be finite: ${field.id}`);
  }
  const conditions = [...rules.fields.flatMap(field => field.visibleWhen), ...rules.actions.flatMap(action => action.requires), ...(rules.map?.nodes.flatMap(node => node.visibleWhen) ?? [])];
  for (const condition of conditions) {
    const field = fields.get(condition.field);
    if (!field) continue;
    if (condition.operator === 'gte' || condition.operator === 'lte') {
      if (field.type !== 'number' || typeof condition.value !== 'number') invalid(`Ordered conditions require numbers: ${field.id}`);
    } else if (condition.value !== null && typeof condition.value !== field.type) invalid(`Condition type mismatch: ${field.id}`);
  }
});

export type StoryRules = z.infer<typeof storyRulesSchema>;
export type StoryAction = StoryRules['actions'][number];
export type StoryValues = Record<string, StoryValue>;
export const storyActionRequestSchema = z.union([
  z.object({ actionId: identifier, expectedVersion: z.number().int().nonnegative() }).strict(),
  z.object({ proposalMessageId: z.number().int().positive().safe(), expectedVersion: z.number().int().nonnegative() }).strict(),
]);
export type StoryActionRequest = z.infer<typeof storyActionRequestSchema>;
export const storyNoteSchema = z.object({ kind: z.enum(['style', 'note', 'thread']), content: z.string().trim().min(1).max(1000) }).strict();
export type StoryNoteInput = z.infer<typeof storyNoteSchema>;

export function getStoryRules(cardData: Record<string, unknown>, source: 'author' | 'snapshot' = 'author'): StoryRules | null {
  const extensions = cardData.extensions as Record<string, unknown> | undefined;
  const squaretable = extensions?.squaretable as Record<string, unknown> | undefined;
  return squaretable?.exploration == null ? null : (source === 'snapshot' ? storedStoryRulesSchema : storyRulesSchema).parse(squaretable.exploration);
}

export function matchesStoryConditions(conditions: z.infer<typeof conditionSchema>[], values: StoryValues): boolean {
  return conditions.every(condition => {
    const value = values[condition.field];
    if (value == null && condition.value !== null) return false;
    if (condition.operator === 'eq') return value === condition.value;
    if (condition.operator === 'ne') return value !== condition.value;
    if (typeof value !== 'number' || typeof condition.value !== 'number') return false;
    return condition.operator === 'gte' ? value >= condition.value : value <= condition.value;
  });
}

export function availableStoryActions(rules: StoryRules | null, values: StoryValues, completed: string[]): StoryAction[] {
  return (rules?.actions ?? []).filter(action => {
    if ((action.once && completed.includes(action.id)) || !matchesStoryConditions(action.requires, values)) return false;
    try { applyStoryAction(rules!, action, values); return true; } catch { return false; }
  });
}

export function applyStoryAction(rules: StoryRules, action: StoryAction, values: StoryValues): StoryValues {
  const result = { ...values };
  for (const change of action.changes) {
    const field = rules.fields.find(item => item.id === change.field)!;
    const previous = result[change.field];
    if (change.operation === 'add' && (typeof previous !== 'number' || typeof change.value !== 'number')) throw new Error('Cannot change an unknown quantity');
    const next = change.operation === 'add' ? (previous as number) + (change.value as number) : change.value;
    if (next !== null && typeof next !== field.type) throw new Error('State type mismatch');
    if (typeof next === 'number' && (!Number.isFinite(next) || next < (field.min ?? -Infinity) || next > (field.max ?? Infinity))) throw new Error('State value is outside the allowed range');
    if (rules.map?.locationField === field.id && next !== previous) {
      const destination = rules.map.nodes.find(node => node.id === next);
      const origin = rules.map.nodes.find(node => node.id === previous);
      if (!destination || !matchesStoryConditions(destination.visibleWhen, result)) throw new Error('Unknown map location');
      if (!origin?.links.includes(destination.id)) throw new Error('No route to this location');
    }
    result[change.field] = next;
  }
  return result;
}

export interface StoryEventView {
  id: string; version: number; actionLabel: string | null; outcome: string | null;
  status: 'confirmed' | 'interrupted' | 'proposed'; inputMessageId: number | null; messageId: number | null;
  excerpt: string; createdAt: string;
  facts?: import('./story-intent').StoryIntent['facts'];
}

export interface StoryStateView {
  adaptationReport?: import('./story-adaptation').StoryAdaptationReport;
  openingRecord?: import('./story-opening-record').OpeningRecord;
  protocol: 1; legacy: boolean; native: boolean; version: number; revision: string | null;
  fields: Array<{ id: string; label: string; value: StoryValue; unit?: string; sourceEventId: string | null }>;
  actions: Array<{ id: string; label: string; intent: StoryAction['intent']; version: number }>;
  map: { location: string | null; nodes: Array<{ id: string; label: string; description?: string; links: string[] }> } | null;
  events: StoryEventView[];
  notes: Array<{ id: string; kind: StoryNoteInput['kind']; content: string; createdAt: string }>;
}
