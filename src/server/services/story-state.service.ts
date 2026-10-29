import { and, eq, desc, lt, inArray } from 'drizzle-orm';
import { db, type Database } from '../../db';
import { chats, messages, type Chat } from '../../db/schema/chats';
import { storyStates, storyEvents, storyNotes } from '../../db/schema/story-state';
import { loadStoryContent } from './story-content.service';
import type { StoryContentSnapshot } from '../../types/story-content';
import { availableStoryActions, applyStoryAction, matchesStoryConditions,
  type StoryRules, type StoryAction, type StoryValues, type StoryActionRequest, type StoryStateView, type StoryNoteInput } from '../../types/story-state';
import { AppError, NotFoundError } from '../../core/errors';
import { frozenStoryRules } from '../../types/story-adapter';
import { applyRitualTurn, ritualScope, ritualIdentityEffect, ritualIdentityClaim, type RitualEffect } from '../../types/story-ritual';
import { buildStoryTurnPrompt } from './story-turn-prompt';
import { storyKnowledgeVisible, storyAudienceExtra, type StoryAudience } from '../../types/story-knowledge';
import { storyIntentSchema, parseStoryIntentOutput, storyIntentVisiblePrefix, storyIntentPresentation, type StoryIntent, type StoredStoryIntent } from '../../types/story-intent';
import { buildStoryIntentPrompt } from './story-intent-prompt';
import type { StoryAdaptationReport } from '../../types/story-adaptation';
import { sourcedStoryRecommendations } from '../../types/story-recommendations';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type StoredState = typeof storyStates.$inferSelect;
type StoredEvent = typeof storyEvents.$inferSelect;

export async function initializeStoryState(transaction: Transaction, chatId: string, content: StoryContentSnapshot) {
  let configs: Array<StoryRules | null>;
  try { configs = content.characters.map(character => frozenStoryRules(character, 'author')); }
  catch { throw new AppError('This card has an invalid exploration configuration. Ask its author to repair it before starting.', 422, 'STORY_RULES_INVALID'); }
  if (configs.some(Boolean) && content.characters.length > 1) throw new AppError('Structured exploration currently supports one character card per story.', 400, 'STORY_RULES_GROUP_UNSUPPORTED');
  await transaction.insert(storyStates).values({ chatId, values: Object.fromEntries((configs[0]?.fields ?? []).map(field => [field.id, field.initial])) });
}

async function ownedChat(chatId: string, userId: string, database: Pick<Database, 'select'> = db) {
  const [chat] = await database.select().from(chats).where(and(eq(chats.id, chatId), eq(chats.userId, userId)));
  if (!chat) throw new NotFoundError('Chat');
  return chat;
}

function eventView(event: StoredEvent, extra?: unknown) {
  const candidate = extra && typeof extra === 'object' ? (extra as Record<string, unknown>).storyFacts : undefined;
  const parsed = candidate ? storyIntentSchema.safeParse({ version: 1, disposition: 'expression', steps: [], facts: candidate }) : null;
  return { id: event.id, version: event.version, actionLabel: event.actionLabel, outcome: event.outcome,
    status: event.status, inputMessageId: event.inputMessageId, messageId: event.messageId,
    excerpt: event.excerpt, createdAt: event.createdAt.toISOString(), ...(parsed?.success ? { facts: parsed.data.facts } : {}) };
}

function publicFields(rules: StoryRules | null, state: StoredState) {
  return (rules?.fields ?? []).filter(field => field.visible && matchesStoryConditions(field.visibleWhen, state.values))
    .map(field => ({ id: field.id, label: field.label, value: state.values[field.id] ?? null, unit: field.unit,
      sourceEventId: state.sources[field.id] ?? null }));
}

export async function getStoryState(chatId: string, userId: string, database: Database = db): Promise<StoryStateView> {
  return database.transaction(transaction => readStoryState(chatId, userId, transaction), { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

export async function readStoryState(chatId: string, userId: string, database: Transaction): Promise<StoryStateView> {
  const chat = await ownedChat(chatId, userId, database);
  const notes = await database.select().from(storyNotes).where(eq(storyNotes.chatId, chatId)).orderBy(storyNotes.createdAt);
  const base = { protocol: 1 as const, legacy: chat.contentSnapshotVersion == null, native: false, version: 0, revision: null,
    fields: [], actions: [], map: null, events: [], notes: notes.map(note => ({ ...note, createdAt: note.createdAt.toISOString() })) };
  if (base.legacy) return base;
  const content = await loadStoryContent(chatId, userId, database);
  const rules = content.characters[0] ? frozenStoryRules(content.characters[0]) : null;
  const [state] = await database.select().from(storyStates).where(eq(storyStates.chatId, chatId));
  if (!state) throw new AppError('Saved story state is unavailable', 409, 'STORY_STATE_UNAVAILABLE');
  const events = await database.select({ event: storyEvents, extra: messages.extra }).from(storyEvents)
    .leftJoin(messages, and(eq(messages.id, storyEvents.messageId), eq(messages.chatId, chatId)))
    .where(eq(storyEvents.chatId, chatId)).orderBy(desc(storyEvents.version)).limit(12);
  const nodes = rules?.map?.nodes.filter(node => matchesStoryConditions(node.visibleWhen, state.values));
  const visibleIds = new Set(nodes?.map(node => node.id));
  const location = rules?.map ? state.values[rules.map.locationField] : null;
  return { ...base, native: rules !== null, version: state.version, revision: content.revision,
    ...(content.characters.length === 1 && content.characters[0].openingRecord ? { openingRecord: content.characters[0].openingRecord } : {}),
    ...(content.characters.length === 1 && content.characters[0].adaptationReport ? { adaptationReport: content.characters[0].adaptationReport } : {}),
    fields: publicFields(rules, state),
    actions: availableStoryActions(rules, state.values, state.completedActions).map(action => ({ id: action.id, label: action.label, intent: action.intent, version: state.version })),
    map: nodes ? { location: typeof location === 'string' && visibleIds.has(location) ? location : null,
      nodes: nodes.map(node => ({ id: node.id, label: node.label, description: node.description, links: node.links.filter(id => visibleIds.has(id)) })) } : null,
    events: events.map(row => eventView(row.event, row.extra)),
  };
}

export interface PreparedStoryTurn {
  chatId: string; userId: string; version: number; rules: StoryRules | null; action: StoryAction | null;
  values: StoryValues; nextValues: StoryValues; completedActions: string[]; sources: Record<string, string>; prompt: string;
  audience?: StoryAudience;
  input: string; intentProtocol?: boolean; confirmedIntent?: StoryIntent; actionIds?: string[];
  turnEffect?: RitualEffect;
  ruleScope?: StoryAdaptationReport['ruleScope'];
}

export async function prepareStoryTurn(chat: Chat, text: string, actionRequest?: StoryActionRequest, database: Database = db,
  knowledge?: { characterId: string; audience?: StoryAudience }): Promise<PreparedStoryTurn | null> {
  return database.transaction(transaction => readStoryTurn(chat, text, actionRequest, transaction, knowledge),
    { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

async function readStoryTurn(chat: Chat, text: string, actionRequest: StoryActionRequest | undefined, database: Transaction,
  knowledge?: { characterId: string; audience?: StoryAudience }): Promise<PreparedStoryTurn | null> {
  if (chat.contentSnapshotVersion == null) {
    if (actionRequest) throw new AppError('This story has no versioned actions', 409, 'STORY_ACTION_UNAVAILABLE');
    return null;
  }
  const content = await loadStoryContent(chat.id, chat.userId, database);
  const rules = content.characters[0] ? frozenStoryRules(content.characters[0]) : null;
  const [state] = await database.select().from(storyStates).where(eq(storyStates.chatId, chat.id));
  if (!state) throw new AppError('Saved story state is unavailable', 409, 'STORY_STATE_UNAVAILABLE');
  if (actionRequest && actionRequest.expectedVersion !== state.version) throw new AppError('The story has moved on. Refresh the available actions.', 409, 'STORY_STATE_CONFLICT');
  const available = availableStoryActions(rules, state.values, state.completedActions);
  let confirmedIntent: StoryIntent | undefined;
  let selectedActions: StoryAction[] = [];
  if (actionRequest && 'proposalMessageId' in actionRequest) {
    if (content.characters.length !== 1) throw new AppError('Action confirmation currently requires a single-character story.', 409, 'STORY_ACTION_UNAVAILABLE');
    const [proposal] = await database.select().from(messages).where(and(eq(messages.chatId, chat.id),
      eq(messages.id, actionRequest.proposalMessageId), eq(messages.role, 'assistant')));
    const saved = (proposal?.extra as Record<string, unknown> | null)?.storyIntent as StoredStoryIntent | undefined;
    if (!saved || saved.expectedVersion !== state.version || saved.input !== text ||
      (proposal?.extra as Record<string, unknown> | null)?.stateStatus !== 'proposed') {
      throw new AppError('This proposed action is stale or its input changed. Describe your intention again.', 409, 'STORY_ACTION_UNAVAILABLE');
    }
    confirmedIntent = storyIntentSchema.parse(saved.intent);
    if (confirmedIntent.disposition !== 'proposal') throw new AppError('Answer the clarification before acting.', 409, 'STORY_ACTION_UNAVAILABLE');
    selectedActions = confirmedIntent.steps.flatMap(step => {
      if (step.kind !== 'execute') return [];
      const selected = rules?.actions.find(item => item.id === step.actionId);
      if (!selected) throw new AppError('The proposed rule is unavailable.', 409, 'STORY_ACTION_UNAVAILABLE');
      return [selected];
    });
  }
  const action = actionRequest ? 'actionId' in actionRequest ? available.find(item => item.id === actionRequest.actionId) : selectedActions[0]
    : available.find(item => [item.label, ...item.aliases].includes(text.trim()));
  if (actionRequest && 'actionId' in actionRequest && (!action || ![action.label, ...action.aliases].includes(text.trim()))) throw new AppError('This action is no longer available or its input has changed.', 409, 'STORY_ACTION_UNAVAILABLE');
  if (!confirmedIntent && action) selectedActions = [action];
  let nextValues = state.values;
  try {
    const completed = [...state.completedActions];
    for (const selected of selectedActions) {
      if (!rules || !availableStoryActions(rules, nextValues, completed).some(item => item.id === selected.id)) throw new Error('Action precondition changed');
      nextValues = applyStoryAction(rules, selected, nextValues);
      completed.push(selected.id);
    }
  }
  catch { throw new AppError('The current state does not allow this action.', 409, 'STORY_ACTION_PRECONDITION'); }
  const view = await readStoryState(chat.id, chat.userId, database);
  const observer = knowledge?.characterId ?? content.characters[0]?.id;
  if (observer && view.events.length) {
    const ids = view.events.flatMap(event => [event.inputMessageId, event.messageId]).filter((id): id is number => id !== null);
    const sources = ids.length ? await database.select({ id: messages.id, extra: messages.extra }).from(messages)
      .where(and(eq(messages.chatId, chat.id), inArray(messages.id, ids))) : [];
    const allowed = new Set(sources.filter(source => storyKnowledgeVisible(source.extra, observer, knowledge?.audience)).map(source => source.id));
    view.events = view.events.filter(event => event.inputMessageId !== null && event.messageId !== null &&
      allowed.has(event.inputMessageId) && allowed.has(event.messageId));
  }
  const combinedAction = selectedActions.length > 1 ? { ...selectedActions[0], label: selectedActions.map(item => item.label).join(' → '),
    outcome: selectedActions.map(item => item.outcome).join('\n') } : action;
  let prompt = buildStoryTurnPrompt(view, combinedAction ?? null);
  const turnEffect = content.characters[0]?.adaptation?.turnEffect;
  if (turnEffect) {
    const completedValues = applyRitualTurn(turnEffect, nextValues, text);
    prompt += `\n[Reviewed end-of-turn rule]\n${ritualScope(turnEffect)}\nThis is a character attribute, not the player's. If this response is a completed expression/clarification or confirmed action, the server will save ${JSON.stringify(completedValues)} at completion. A pending proposal, malformed protocol or interrupted generation does not advance it. Never infer damage, enemies, player resources or additional effects from this counter.`;
    if (turnEffect === ritualIdentityEffect) {
      prompt += `\nThe frozen source makes Kakaa worship a player who directly claims to be the bird god. The server's exact-input identity trigger for THIS input is ${ritualIdentityClaim(text)}. The saved claim after successful completion will be ${completedValues['kakaa-identity-claim']}. If true, portray her authored devoted response. This is her belief in the player's self-description, not proof of divine powers, money, authority over other characters, or permission to skip other rules. Do not reveal this hidden condition before it has triggered. A quoted, negative, hypothetical or interrogative phrase does not trigger it.`;
    }
  }
  const intentProtocol = content.characters.length === 1;
  if (confirmedIntent) prompt += `\nThe player reviewed and confirmed this interpretation: ${JSON.stringify(confirmedIntent)}. Only the authored rule outcome above changes structured resources. Exploration and typed claims have no numeric authority; respond to the confirmed free action now without proposing it again.`;
  else if (intentProtocol && !action) prompt += `\n${buildStoryIntentPrompt(available.map(item => ({ id: item.id, label: item.label })))}`;
  if (intentProtocol && (action || confirmedIntent)) prompt += '\n' + buildStoryIntentPrompt([], true);
  return { chatId: chat.id, userId: chat.userId, version: state.version, rules, action: combinedAction ?? null,
    values: state.values, nextValues, completedActions: state.completedActions, sources: state.sources, prompt, audience: knowledge?.audience,
    input: text, intentProtocol, confirmedIntent, actionIds: selectedActions.map(item => item.id), turnEffect,
    ruleScope: view.adaptationReport?.ruleScope };
}

export async function commitStoryTurn(turn: PreparedStoryTurn, inputMessageId: number, requestId: string, text: string, interrupted: boolean, database: Database = db, characterId?: string, originalOutput?: string) {
  const raw = originalOutput ?? text;
  const parsed = turn.intentProtocol ? parseStoryIntentOutput(raw, turn.input ?? '',
    availableStoryActions(turn.rules, turn.values, turn.completedActions).map(action => action.id)) : null;
  const interpreting = turn.intentProtocol && !turn.action && !turn.confirmedIntent;
  const unconfirmed = interrupted || Boolean(interpreting && parsed?.invalid);
  const proposed = !interrupted && interpreting && parsed?.intent?.disposition === 'proposal';
  if (interpreting && (proposed || parsed?.invalid || originalOutput === undefined)) text = storyIntentPresentation(raw, turn.input ?? '',
    availableStoryActions(turn.rules, turn.values, turn.completedActions).map(action => action.id), interrupted);
  else if (parsed && originalOutput === undefined) text = interrupted ? storyIntentVisiblePrefix(parsed.content) : parsed.content;
  if (parsed?.intent) parsed.intent.facts = parsed.intent.facts.filter(fact => fact.speaker === 'player' || text.includes(fact.evidence));
  return database.transaction(async transaction => {
    const [chat] = await transaction.select({ id: chats.id }).from(chats)
      .where(and(eq(chats.id, turn.chatId), eq(chats.userId, turn.userId))).for('key share');
    if (!chat) throw new AppError('Saved story state is unavailable', 409, 'STORY_STATE_UNAVAILABLE');
    const [state] = await transaction.select().from(storyStates).where(eq(storyStates.chatId, turn.chatId)).for('update');
    if (!state) throw new AppError('Saved story state is unavailable', 409, 'STORY_STATE_UNAVAILABLE');
    const [existing] = await transaction.select().from(storyEvents).where(and(eq(storyEvents.chatId, turn.chatId), eq(storyEvents.requestId, requestId)));
    if (existing?.messageId) {
      if (existing.inputMessageId !== inputMessageId) throw new AppError('This turn has a different source', 409, 'IDEMPOTENCY_CONFLICT');
      const [message] = await transaction.select().from(messages).where(eq(messages.id, existing.messageId));
      if (message) return message;
      throw new AppError('The committed turn has no source message', 409, 'STORY_SOURCE_UNAVAILABLE');
    }
    if (state.version !== turn.version) throw new AppError('Another turn changed the story. Refresh before continuing.', 409, 'STORY_STATE_CONFLICT');
    const [source] = await transaction.select({ id: messages.id, extra: messages.extra, content: messages.content }).from(messages)
      .where(and(eq(messages.id, inputMessageId), eq(messages.chatId, turn.chatId), eq(messages.role, 'user')));
    if (!source) throw new NotFoundError('Action source');
    if (typeof turn.input !== 'string' || source.content !== turn.input) {
      throw new AppError('The saved input does not match the prepared rule source.', 409, 'STORY_SOURCE_UNAVAILABLE');
    }
    const sourceAudience = (source.extra as Record<string, unknown> | null)?.storyAudience;
    if (JSON.stringify(sourceAudience ?? null) !== JSON.stringify(storyAudienceExtra(turn.audience).storyAudience ?? null)) {
      throw new AppError('The response audience does not match its source.', 409, 'STORY_AUDIENCE_CONFLICT');
    }
    const nextValues = unconfirmed || proposed ? state.values : applyRitualTurn(turn.turnEffect, turn.nextValues, source.content);
    const changes = Object.fromEntries(Object.entries(nextValues).filter(([key, value]) => state.values[key] !== value)
      .map(([key, value]) => [key, { before: state.values[key], after: value }]));
    const [message] = await transaction.insert(messages).values({ chatId: turn.chatId, role: 'assistant', content: text, characterId,
      extra: { storyRequestId: requestId, storyVersion: state.version + 1, stateStatus: unconfirmed ? 'interrupted' : proposed ? 'proposed' : 'confirmed',
        ...storyAudienceExtra(turn.audience),
        ...(turn.intentProtocol && !unconfirmed ? !proposed && parsed?.recommendations?.length === 3
          ? { storyRecommendations: parsed.recommendations, storyRecommendationsSource: 'generated' }
          : sourcedStoryRecommendations(text) : {}),
        ...(!interrupted && !turn.confirmedIntent && !turn.action && parsed?.intent ? {
          storyIntent: { intent: parsed.intent, input: turn.input, expectedVersion: state.version + 1 },
        } : {}),
        ...(!interrupted && parsed?.invalid ? { storyIntentInvalid: true } : {}),
        ...(!interrupted && turn.confirmedIntent ? { storyConfirmedIntent: turn.confirmedIntent } : {}),
        ...(!interrupted && !proposed && (turn.confirmedIntent?.facts.length || parsed?.intent?.facts.length) ? {
          storyFacts: turn.confirmedIntent?.facts ?? parsed?.intent?.facts,
        } : {}),
      } }).returning();
    const [event] = await transaction.insert(storyEvents).values({ chatId: turn.chatId, requestId, version: state.version + 1,
      actionId: turn.action?.id, actionLabel: turn.action?.label, outcome: !interrupted ? turn.action?.outcome : null,
      status: unconfirmed ? 'interrupted' : proposed ? 'proposed' : 'confirmed', inputMessageId, messageId: message.id, changes, excerpt: text.slice(0, 600) }).returning();
    await transaction.update(storyStates).set({ version: event.version, values: nextValues,
      completedActions: !interrupted && turn.action ? [...new Set([...state.completedActions, ...(turn.actionIds ?? [turn.action.id])])] : state.completedActions,
      sources: { ...state.sources, ...Object.fromEntries(Object.keys(changes).map(key => [key, event.id])) }, updatedAt: new Date(),
    }).where(eq(storyStates.chatId, turn.chatId));
    return message;
  });
}

export async function getStoryEvents(chatId: string, userId: string, beforeVersion?: number, database: Pick<Database, 'select'> = db) {
  await ownedChat(chatId, userId, database);
  return (await database.select({ event: storyEvents, extra: messages.extra }).from(storyEvents)
    .leftJoin(messages, and(eq(messages.id, storyEvents.messageId), eq(messages.chatId, chatId)))
    .where(and(eq(storyEvents.chatId, chatId), beforeVersion == null ? undefined : lt(storyEvents.version, beforeVersion)))
    .orderBy(desc(storyEvents.version)).limit(30)).map(row => eventView(row.event, row.extra));
}

export async function getStoryEvent(chatId: string, userId: string, eventId: string, database: Pick<Database, 'select'> = db) {
  const [row] = await database.select({ event: storyEvents, extra: messages.extra }).from(storyEvents)
    .innerJoin(chats, and(eq(chats.id, storyEvents.chatId), eq(chats.userId, userId)))
    .leftJoin(messages, and(eq(messages.id, storyEvents.messageId), eq(messages.chatId, chatId)))
    .where(and(eq(storyEvents.chatId, chatId), eq(storyEvents.id, eventId)));
  if (!row) throw new NotFoundError('Story event');
  return eventView(row.event, row.extra);
}

export async function addStoryNote(chatId: string, userId: string, input: StoryNoteInput, database: Database = db) {
  return database.transaction(async transaction => {
    const [chat] = await transaction.select({ id: chats.id }).from(chats).where(and(eq(chats.id, chatId), eq(chats.userId, userId))).for('update');
    if (!chat) throw new NotFoundError('Chat');
    const existing = await transaction.select({ id: storyNotes.id, content: storyNotes.content }).from(storyNotes).where(eq(storyNotes.chatId, chatId));
    if (existing.length >= 20) throw new AppError('Keep at most 20 notes in one story.', 400, 'STORY_NOTES_LIMIT');
    if (existing.reduce((total, note) => total + note.content.length, input.content.length) > 4000) throw new AppError('Story notes may contain at most 4000 characters in total.', 400, 'STORY_NOTES_LIMIT');
    const [note] = await transaction.insert(storyNotes).values({ chatId, ...input }).returning();
    return note;
  });
}

export async function deleteStoryNote(chatId: string, userId: string, noteId: string, database: Database = db) {
  await ownedChat(chatId, userId, database);
  const removed = await database.delete(storyNotes).where(and(eq(storyNotes.chatId, chatId), eq(storyNotes.id, noteId))).returning();
  if (!removed.length) throw new NotFoundError('Story note');
}

export async function saveStoryOpening(chatId: string, userId: string, content: string, database: Database = db) {
  return database.transaction(async transaction => {
    const [chat] = await transaction.select({ id: chats.id }).from(chats).where(and(eq(chats.id, chatId), eq(chats.userId, userId))).for('update');
    if (!chat) throw new NotFoundError('Chat');
    const [existing] = await transaction.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(messages.id).limit(1);
    if (existing) {
      if (existing.role === 'assistant' && existing.content === content) return { message: existing, created: false };
      throw new AppError('This story has already begun with a different opening.', 409, 'STORY_OPENING_EXISTS');
    }
    const [message] = await transaction.insert(messages).values({ chatId, role: 'assistant', content,
      extra: sourcedStoryRecommendations(content) }).returning();
    return { message, created: true };
  });
}
