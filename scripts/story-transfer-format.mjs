import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { storyContentSnapshotSchema } from '../src/types/story-content.ts';
import { storyWorldbooksSnapshotSchema } from '../src/types/story-worldbooks.ts';
import { storyIdentitySnapshotSchema } from '../src/types/story-identity.ts';
import { storyIntentSchema } from '../src/types/story-intent.ts';
import { parseStoryMemoryResult } from '../src/server/services/story-memory-extraction.ts';
import { safeReadingLayout } from '../src/types/story-corrections.ts';
import { revalidatePresentationDraft } from '../src/server/services/story-presentation-workflow.ts';
import { validateTransferredState } from './story-transfer-state.mjs';

export const transferTables = ['chats', 'chat_characters', 'messages', 'story_content', 'story_worldbooks',
  'story_states', 'story_events', 'story_notes', 'character_memories', 'character_memory_vectors',
  'story_memory_progress', 'story_memory_jobs', 'story_memory_links', 'generation_requests', 'chat_creation_requests',
  'chat_overrides', 'legacy_chat_variables', 'character_emotions', 'message_bookmarks', 'message_reactions', 'story_branches', 'story_readings'];
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const localReferencePattern = /(?<![a-zA-Z0-9:/\.])\/uploads\/[^\s"'<>()[\]{}?#]+/g;
const uuid = z.string().uuid();
const row = z.record(z.unknown());
const envelope = z.object({ format: z.literal('small-squaretable.admin-story'), version: z.literal(1),
  exportedAt: z.string().datetime(), lineageId: uuid, schema: z.array(row),
  tables: z.object(Object.fromEntries(transferTables.map(table => [table, z.array(row).max(100000)]))).strict(),
  files: z.array(z.object({ url: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), content: z.string() }).strict()).max(1000),
}).strict();

export function localReferences(value) {
  const found = new Set();
  function visit(item) {
    if (typeof item === 'string') for (const match of item.matchAll(localReferencePattern)) found.add(match[0]);
    else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === 'object') Object.values(item).forEach(visit);
  }
  visit(value);
  return [...found].sort();
}

export function safeUploadPath(url) {
  assert.match(url, /^\/uploads\/[a-zA-Z0-9_./-]+$/, 'Unsupported local attachment path');
  const path = url.slice('/uploads/'.length);
  assert.ok(path.split('/').every(part => part && part !== '.' && part !== '..'), 'Unsafe attachment path');
  return path;
}

export function memorySources(tables, job) {
  const messages = new Map(tables.messages.map(message => [message.id, message]));
  return tables.story_events.filter(event => job.source_event_ids.includes(event.id)).sort((left, right) => left.version - right.version)
    .map(event => ({ eventId: event.id, version: event.version, inputMessageId: event.input_message_id,
      messageId: event.message_id, input: messages.get(event.input_message_id)?.content, reply: messages.get(event.message_id)?.content }));
}

function validateCorrections(tables, chat, messages) {
  assert.ok(tables.story_branches.length <= 1, 'Multiple branch origins');
  for (const branch of tables.story_branches) {
    uuid.parse(branch.root_id); uuid.parse(branch.parent_id);
    assert.ok(branch.parent_id !== chat.id && Number.isInteger(branch.through_version) && branch.through_version >= 0, 'Invalid fork origin');
    assert.ok(['choice', 'evidenced', 'conflict', 'adaptation'].includes(branch.mode), 'Invalid correction mode');
    assert.ok(typeof branch.direction === 'string' && branch.direction.length > 0 && branch.direction.length <= 2000, 'Invalid correction direction');
    assert.ok(Array.isArray(branch.evidence_ids) && branch.evidence_ids.length <= 8 && branch.evidence_ids.every(id => Number.isSafeInteger(id) && id > 0), 'Invalid parent evidence references');
  }
  for (const reading of tables.story_readings) {
    uuid.parse(reading.request_id);
    const source = messages.get(reading.message_id);
    assert.ok(source && source.role !== 'system' && typeof reading.content === 'string', 'Invalid reading source');
    assert.ok(reading.kind === 'annotation' ? reading.content.length > 0 && reading.content.length <= 2000 :
      reading.kind === 'layout' && source.role === 'assistant' && safeReadingLayout(source.content, reading.content), 'Unsafe reading revision');
    assert.ok(reading.revoked_at === null || Number.isFinite(Date.parse(reading.revoked_at)), 'Invalid reading revocation');
  }
}

export function validateStoryBundle(input) {
  const bundle = envelope.parse(input);
  const tables = bundle.tables;
  assert.equal(tables.chats.length, 1, 'Exactly one story required');
  const chat = tables.chats[0];
  uuid.parse(chat.id); uuid.parse(chat.user_id); uuid.parse(chat.tenant_id);
  assert.equal(chat.content_snapshot_version, 1, 'Legacy story requires whole-database restore');
  assert.equal(chat.worldbook_snapshot_version, 1);
  storyIdentitySnapshotSchema.parse(chat.identity_snapshot);
  assert.equal(chat.identity_snapshot.userId, chat.user_id);
  assert.equal(chat.identity_snapshot.tenantId, chat.tenant_id);
  for (const name of ['story_content', 'story_worldbooks', 'story_states']) assert.equal(tables[name].length, 1, `Missing ${name}`);
  const content = storyContentSnapshotSchema.parse(tables.story_content[0].snapshot);
  for (const character of content.characters) if (character.presentation) revalidatePresentationDraft(character, character.presentation.draft);
  const books = storyWorldbooksSnapshotSchema.parse(tables.story_worldbooks[0].snapshot);
  const characterIds = new Set(content.characters.map(character => character.id));
  assert.equal(characterIds.size, content.characters.length);
  assert.ok(chat.character_id === null || characterIds.has(chat.character_id), 'Unknown primary character');
  assert.deepEqual(new Set(tables.chat_characters.map(member => member.character_id)), characterIds, 'Frozen cast mismatch');
  for (const binding of books.bindings) assert.ok(characterIds.has(binding.characterId), 'Unknown book owner');
  for (const name of transferTables) for (const item of tables[name]) {
    if ('chat_id' in item) assert.equal(item.chat_id, chat.id, `Cross-story ${name}`);
    if ('source_chat_id' in item) assert.equal(item.source_chat_id, chat.id, 'Cross-story memory');
    if ('character_id' in item && item.character_id !== null) assert.ok(characterIds.has(item.character_id), `Unknown character in ${name}`);
    if ('user_id' in item) assert.equal(item.user_id, chat.user_id, 'Cross-owner data');
  }
  for (const name of transferTables) {
    const ids = tables[name].filter(item => 'id' in item).map(item => item.id);
    assert.equal(new Set(ids).size, ids.length, `Duplicate ${name} identifiers`);
  }
  const messages = new Map(tables.messages.map(message => [message.id, message]));
  validateCorrections(tables, chat, messages);
  const events = new Map(tables.story_events.map(event => [event.id, event]));
  const memories = new Map(tables.character_memories.map(memory => [memory.id, memory]));
  const jobs = new Map(tables.story_memory_jobs.map(job => [job.id, job]));
  assert.equal(tables.legacy_chat_variables.length, 0, 'Versioned stories cannot import legacy variable state');
  for (const item of [...tables.message_bookmarks, ...tables.message_reactions]) assert.ok(messages.has(item.message_id), 'Missing marked message');
  for (const item of tables.character_emotions) assert.ok(item.trigger_message_id === null || messages.has(item.trigger_message_id), 'Missing emotion source');
  for (const request of tables.generation_requests) {
    assert.ok(['completed', 'stopped', 'failed'].includes(request.status), 'Drain active generation requests before export');
    assert.ok(request.user_message_id === null || messages.get(request.user_message_id)?.role === 'user', 'Broken accepted-request source');
  }
  for (const message of messages.values()) {
    assert.ok(Number.isSafeInteger(message.id) && message.id > 0, 'Unsafe message identifier');
    assert.ok(message.parent_message_id === null || messages.has(message.parent_message_id), 'Unknown parent message');
    if (message.extra && Object.hasOwn(message.extra, 'storyAudience')) {
      const audience = message.extra.storyAudience;
      assert.ok(Array.isArray(audience) && audience.length && new Set(audience).size === audience.length && audience.every(id => characterIds.has(id)), 'Invalid private audience');
    }
  }
  assert.ok(chat.last_read_message_id === null || messages.has(chat.last_read_message_id), 'Unknown read cursor');
  const state = tables.story_states[0];
  assert.equal(new Set([...events.values()].map(event => event.version)).size, events.size, 'Duplicate event versions');
  assert.equal(events.size, state.version, 'Incomplete event history');
  for (const event of events.values()) {
    uuid.parse(event.id);
    const inputMessage = messages.get(event.input_message_id);
    const outputMessage = messages.get(event.message_id);
    assert.ok(inputMessage?.role === 'user' && outputMessage?.role === 'assistant', 'Broken event source');
    assert.ok(event.version > 0 && event.version <= state.version, 'Invalid event version');
    assert.ok(['confirmed', 'interrupted', 'proposed'].includes(event.status), 'Invalid event status');
    assert.equal(outputMessage.extra?.stateStatus, event.status, 'Event/message status mismatch');
    assert.equal(outputMessage.extra?.storyVersion, event.version);
    assert.equal(outputMessage.extra?.storyRequestId, event.request_id);
    assert.deepEqual(inputMessage.extra?.storyAudience ?? null, outputMessage.extra?.storyAudience ?? null, 'Audience mismatch');
    if (event.status === 'proposed') {
      const stored = outputMessage.extra.storyIntent;
      assert.equal(stored?.input, inputMessage.content, 'Candidate input mismatch');
      assert.equal(stored.expectedVersion, event.version, 'Candidate version mismatch');
      assert.equal(storyIntentSchema.parse(stored.intent).disposition, 'proposal');
    }
  }
  for (const source of Object.values(state.sources)) assert.equal(events.get(source)?.status, 'confirmed', 'Unconfirmed state source');
  validateTransferredState(content, tables.story_events, tables.messages, state);
  for (const memory of memories.values()) assert.ok(messages.has(memory.source_message_id), 'Missing memory source');
  for (const vector of tables.character_memory_vectors) {
    assert.ok(memories.has(vector.memory_id), 'Missing vector memory');
    const values = typeof vector.embedding === 'string' ? JSON.parse(vector.embedding) : vector.embedding;
    assert.ok(Array.isArray(values) && values.length === 384 && values.every(Number.isFinite) && values.some(value => value !== 0), 'Invalid embedding');
  }
  for (const progress of tables.story_memory_progress) {
    assert.ok(progress.event_ids.length < 5 && new Set(progress.event_ids).size === progress.event_ids.length);
    for (const id of progress.event_ids) assert.equal(events.get(id)?.status, 'confirmed', 'Invalid memory progress');
  }
  for (const job of jobs.values()) {
    assert.ok(['pending', 'retry', 'failed', 'succeeded'].includes(job.status), 'Drain running memory jobs before export');
    assert.ok(job.lease_token === null && job.lease_until === null, 'Active memory lease');
    assert.equal(new Set(job.source_event_ids).size, 5, 'Incomplete memory batch');
    for (const id of job.source_event_ids) {
      const event = events.get(id);
      assert.equal(event?.status, 'confirmed', 'Unconfirmed memory batch');
      assert.equal(messages.get(event.message_id).character_id ?? chat.character_id, job.character_id, 'Memory batch character mismatch');
    }
    const sources = memorySources(tables, job);
    if (job.extracted !== null) {
      assert.equal(job.source_digest, digest(sources), 'Changed checkpoint sources');
      parseStoryMemoryResult(job.extracted, sources);
    } else assert.ok(job.status !== 'succeeded' && job.source_digest === null, 'Missing checkpoint');
  }
  for (const link of tables.story_memory_links) {
    const job = jobs.get(link.job_id), event = events.get(link.event_id), memory = memories.get(link.memory_id);
    assert.ok(job && event && memory && job.source_event_ids.includes(event.id) && job.character_id === memory.character_id &&
      [event.input_message_id, event.message_id].includes(link.message_id), 'Broken memory link');
  }
  const urls = new Set();
  let totalBytes = 0;
  for (const file of bundle.files) {
    safeUploadPath(file.url);
    assert.ok(!urls.has(file.url), 'Duplicate attachment'); urls.add(file.url);
    const bytes = Buffer.from(file.content, 'base64');
    assert.equal(bytes.toString('base64'), file.content, 'Invalid attachment encoding');
    totalBytes += bytes.length;
    assert.ok(totalBytes <= 64 * 1024 * 1024, 'Attachment budget exceeded');
    assert.equal(digest(bytes), file.sha256, 'Attachment digest mismatch');
  }
  assert.deepEqual([...urls].sort(), localReferences(tables), 'Missing or unrelated local attachments');
  return bundle;
}
