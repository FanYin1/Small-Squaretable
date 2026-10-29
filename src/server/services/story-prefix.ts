import { isDeepStrictEqual } from 'node:util';
import type { Message } from '../../db/schema/chats';
import type { storyEvents, storyStates } from '../../db/schema/story-state';
import type { StoryContentSnapshot } from '../../types/story-content';
import { availableStoryActions, applyStoryAction, type StoryValues } from '../../types/story-state';
import { frozenStoryRules } from '../../types/story-adapter';
import { applyRitualTurn } from '../../types/story-ritual';
import { storyIntentSchema } from '../../types/story-intent';
import { AppError } from '../../core/errors';

type Event = typeof storyEvents.$inferSelect;
type State = typeof storyStates.$inferSelect;
function fail(): never { throw new AppError('此位置缺少可验证的完整轮次与状态来源，暂不能建立分支。', 409, 'STORY_PREFIX_UNAVAILABLE'); }

export function reconstructStoryPrefix(content: StoryContentSnapshot, history: Message[], events: Event[], state: State, throughVersion: number) {
  if (!Number.isInteger(throughVersion) || throughVersion < 0 || history.length > 5000 || events.length > 2000 || events.length !== state.version || throughVersion > state.version) fail();
  const rules = content.characters[0] ? frozenStoryRules(content.characters[0]) : null;
  if (content.characters.length > 1 && rules) fail();
  const byId = new Map(history.map(message => [message.id, message]));
  let values: StoryValues = Object.fromEntries((rules?.fields ?? []).map(field => [field.id, field.initial]));
  let completedActions: string[] = [];
  let sources: Record<string, string> = {};
  let prefix = { values: structuredClone(values), completedActions: [...completedActions], sources: { ...sources } };
  let lastMessageId = 0;
  let lastInputId = 0;
  const used = new Set<number>();
  for (const [index, event] of events.entries()) {
    const input = byId.get(event.inputMessageId ?? 0);
    const reply = byId.get(event.messageId ?? 0);
    const extra = reply?.extra as Record<string, unknown> | null;
    if (event.version !== index + 1 || input?.role !== 'user' || reply?.role !== 'assistant' ||
      !['confirmed', 'proposed', 'interrupted'].includes(event.status) ||
      (input.id !== lastInputId && input.id <= lastMessageId) ||
      reply.id <= input.id || reply.id <= lastMessageId || extra?.storyVersion !== event.version ||
      extra?.stateStatus !== event.status || extra?.storyRequestId !== event.requestId ||
      !isDeepStrictEqual((input.extra as Record<string, unknown> | null)?.storyAudience ?? null, extra?.storyAudience ?? null)) fail();
    used.add(input.id); used.add(reply.id); lastMessageId = reply.id; lastInputId = input.id;
    let next = values;
    let actions: string[] = [];
    if (event.status === 'confirmed') {
      if (extra?.storyConfirmedIntent) {
        const intent = storyIntentSchema.safeParse(extra.storyConfirmedIntent);
        if (!intent.success || intent.data.disposition !== 'proposal' || typeof input.content !== 'string' ||
          intent.data.steps.some(step => !input.content.includes(step.evidence)) ||
          intent.data.facts.some(fact => fact.speaker !== 'player' || !input.content.includes(fact.evidence))) fail();
        const previous = events[index - 1];
        const proposal = byId.get(previous?.messageId ?? 0)?.extra as Record<string, unknown> | null;
        const saved = proposal?.storyIntent as { expectedVersion?: number; input?: string; intent?: unknown } | undefined;
        if (previous?.status !== 'proposed' || saved?.expectedVersion !== event.version - 1 ||
          saved?.input !== input.content || byId.get(previous.inputMessageId ?? 0)?.content !== input.content ||
          !isDeepStrictEqual(saved?.intent, intent.data)) fail();
        actions = intent.data.steps.flatMap(step => step.kind === 'execute' ? [step.actionId] : []);
      } else if (event.actionId) {
        const action = rules?.actions.find(item => item.id === event.actionId);
        if (!action || typeof input.content !== 'string' || ![action.label, ...action.aliases].includes(input.content.trim())) fail();
        actions = [event.actionId];
      }
      if ((actions[0] ?? null) !== event.actionId) fail();
      for (const actionId of actions) {
        const action = availableStoryActions(rules, next, completedActions).find(item => item.id === actionId);
        if (!rules || !action) fail();
        next = applyStoryAction(rules, action, next);
        completedActions = [...new Set([...completedActions, actionId])];
      }
    }
    if (event.status === 'confirmed') next = applyRitualTurn(content.characters[0]?.adaptation?.turnEffect, next, input.content);
    const changes = Object.fromEntries(Object.entries(next).filter(([key, value]) => !isDeepStrictEqual(values[key], value))
      .map(([key, value]) => [key, { before: values[key], after: value }]));
    if (!isDeepStrictEqual(changes, event.changes)) fail();
    values = next;
    sources = { ...sources, ...Object.fromEntries(Object.keys(changes).map(key => [key, event.id])) };
    if (event.version === throughVersion) prefix = { values: structuredClone(values), completedActions: [...completedActions], sources: { ...sources } };
  }
  if (!isDeepStrictEqual(values, state.values) || !isDeepStrictEqual(completedActions, state.completedActions) || !isDeepStrictEqual(sources, state.sources)) fail();
  const firstInput = history.find(message => message.role === 'user')?.id ?? Infinity;
  const openings = history.filter(message => message.id < firstInput);
  if (openings.some(message => message.role !== 'assistant' || used.has(message.id))) fail();
  if (history.some(message => message.id >= firstInput && !used.has(message.id))) fail();
  if (history.some(message => message.parentMessageId !== null)) fail();
  if (throughVersion > 0) {
    const last = events[throughVersion - 1];
    if (last.status !== 'confirmed' || events[throughVersion]?.inputMessageId === last.inputMessageId) fail();
    if (events.filter(event => event.inputMessageId === last.inputMessageId).some(event => event.status !== 'confirmed')) fail();
  }
  const cutoff = throughVersion ? events[throughVersion - 1].messageId! : openings.at(-1)?.id ?? 0;
  const retained = history.filter(message => message.id <= cutoff);
  return { ...prefix, rules, history: retained, events: events.slice(0, throughVersion) };
}
