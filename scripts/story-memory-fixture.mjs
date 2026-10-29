import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { inspectStoryMemoryJob, retryStoryMemoryJob } from './story-memory-retry.mjs';

const url = new URL(process.env.DATABASE_URL || 'http://missing');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname, '/squaretable_story_restore_test');
assert.equal(url.username, 'restore_check');
assert.ok(process.env.STORY_MEMORY_FIXTURE);
const client = postgres(url.toString(), { max: 5 });
const schema = await import('../src/db/schema/index.ts');
const { ChatCreationService } = await import('../src/server/services/chat-creation.service.ts');
const { prepareStoryTurn, commitStoryTurn } = await import('../src/server/services/story-state.service.ts');
const { StoryMemoryWorker } = await import('../src/server/services/story-memory-worker.service.ts');
const { MemoryRepository } = await import('../src/db/repositories/memory.repository.ts');
const database = drizzle(client, { schema });
const creation = new ChatCreationService(database);
const base = JSON.parse(await readFile(process.env.STORY_RESTORE_FIXTURE, 'utf8'));
const options = { maxAttempts: 3, timeoutMs: 1000, maxInputChars: 24000, memoryLimit: 100 };
const embedding = Array.from({ length: 384 }, (_, index) => index === 0 ? 1 : 0);
const checks = [];
const check = name => checks.push(name);
let extractions = 0;
const providers = {
  async extract(sources) {
    extractions++;
    assert.equal(sources.length, 5);
    assert.ok(sources.every(source => !source.reply.includes('中止标记')));
    return { version: 1, facts: [{ type: 'event', content: sources[0].reply, sourceMessageIds: [sources[0].messageId] }],
      summary: { content: 'SUMMARY_LIGHTHOUSE_MEETING：已约定在灯塔会面；会面仍未发生。', sourceMessageIds: [sources[0].messageId] } };
  },
  async embed(texts) { return texts.map(() => embedding); },
};
const worker = (overrides = {}, settings = {}) => new StoryMemoryWorker(database, { ...providers, ...overrides }, { ...options, ...settings });
const createChat = async characterIds => (await creation.create(base.userId, base.tenantId,
  { characterIds: characterIds ?? [base.characterId], clientRequestId: randomUUID() })).chat;
async function turn(chat, interrupted = false, characterId, db = database) {
  const text = `记忆验收对话 ${randomUUID()}`;
  const prepared = await prepareStoryTurn(chat, text, undefined, db);
  const [input] = await db.insert(schema.messages).values({ chatId: chat.id, role: 'user', content: '希望在灯塔会面。' }).returning();
  const requestId = randomUUID();
  const reply = interrupted ? '中止标记：未完成片段。' : `约定在灯塔会面。${text}`;
  const message = await commitStoryTurn(prepared, input.id, requestId, reply, interrupted, db, characterId);
  return { prepared, inputId: input.id, requestId, reply, message };
}
async function batch(chat, count = 5, characterId) {
  for (let index = 0; index < count; index++) await turn(chat, false, characterId);
}
const getJobs = chat => client`SELECT * FROM story_memory_jobs WHERE chat_id = ${chat.id} ORDER BY created_at, id`;
const due = job => client`UPDATE story_memory_jobs SET available_at = now() - interval '1 second' WHERE id = ${job.id}`;
const stored = chat => client`SELECT * FROM character_memories WHERE source_chat_id = ${chat.id}`;
const assertEmpty = async chat => assert.equal((await stored(chat)).length, 0);
async function freshJob() {
  const chat = await createChat();
  await batch(chat);
  const [job] = await getJobs(chat);
  assert.ok(job);
  return { chat, job };
}
function gate() {
  let release;
  let enter;
  const entered = new Promise(resolve => { enter = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  return { entered, release, wait: async () => { enter(); await blocked; } };
}

try {
  if (process.argv[2] === 'seed') {
    const partial = await createChat();
    await batch(partial, 3);
    await turn(partial, true);
    assert.equal((await getJobs(partial)).length, 0);
    const complete = await createChat();
    await batch(complete);
    assert.equal(await worker().runOnce(), 'succeeded');
    const persistedStyle = await createChat();
    await batch(persistedStyle);
    await client`UPDATE messages SET content = '本次体验请用短句，少用比喻。' WHERE chat_id = ${persistedStyle.id} AND role = 'user'`;
    assert.equal(await worker({ extract: async sources => ({ version: 1,
      facts: [{ type: 'preference', content: '本次体验请用短句，少用比喻。', sourceMessageIds: [sources[0].inputMessageId] }],
      summary: { content: '已明确提出短句偏好。', sourceMessageIds: [sources[0].inputMessageId] },
    }) }).runOnce(), 'succeeded');
    const checkpoint = await createChat();
    await batch(checkpoint);
    assert.equal(await worker({ embed: async () => { throw new Error('controlled unavailable embedding'); } }).runOnce(), 'retry');
    const [job] = await getJobs(checkpoint);
    assert.ok(job.extracted);
    await assertEmpty(checkpoint);
    const { seedLongMemoryStory } = await import('./story-memory-longrun-fixture.mjs');
    const longrun = await seedLongMemoryStory({ client, database, createChat, worker });
    await writeFile(process.env.STORY_MEMORY_FIXTURE, JSON.stringify({ partial, complete, checkpoint, longrun, persistedStyle }), { mode: 0o600 });
    console.info('Seeded persisted partial progress, successful sourced memory and extraction checkpoint before dump');
  } else {
    assert.equal(process.argv[2], 'verify');
    const fixture = JSON.parse(await readFile(process.env.STORY_MEMORY_FIXTURE, 'utf8'));
    const { verifiedStoryMemoryOrigins } = await import('../src/server/services/story-knowledge.service.ts');
    const styleMemories = await stored(fixture.persistedStyle);
    assert.equal(styleMemories.length, 1);
    const restoredOrigins = await verifiedStoryMemoryOrigins(fixture.persistedStyle.id, base.characterId,
      styleMemories.map(memory => memory.id), undefined, database);
    assert.equal(restoredOrigins.get(styleMemories[0].id)?.content, '本次体验请用短句，少用比喻。');
    assert.equal(restoredOrigins.get(styleMemories[0].id)?.firstVersion, 1);
    check('Derived style preference survives full backup and a new process with validated original source and version');
    assert.equal((await getJobs(fixture.complete))[0].status, 'succeeded');
    assert.equal((await stored(fixture.complete)).length, 1);
    const [restored] = await getJobs(fixture.checkpoint);
    const { getStorySummaries: readSummaries } = await import('../src/server/services/story-summary.service.ts');
    assert.deepEqual(await readSummaries(fixture.checkpoint.id, base.userId, base.tenantId, base.characterId, database), []);
    await due(restored);
    assert.equal(await worker({ extract: async () => { throw new Error('checkpoint must prevent a second model call'); } }).runOnce(), 'succeeded');
    check('Dump/restore plus a separate process resumes the saved extraction without another model call');
    const { checkStorySummaries } = await import('./story-summary-fixture.mjs');
    await checkStorySummaries({ database, client, base, chatId: fixture.checkpoint.id, check });
    const repository = new MemoryRepository(database);
    const retrieved = await repository.hybridSearch({ characterId: base.characterId, userId: base.userId, chatId: fixture.checkpoint.id, embedding });
    assert.equal(retrieved.length, 1);
    assert.equal(retrieved[0].content, restored.extracted.facts[0].content);
    assert.equal((await client`SELECT * FROM story_memory_links WHERE job_id = ${restored.id}`).length, 1);
    check('Recovered memory is retrievable by real pgvector and retains message/event provenance');
    const { verifyLongMemoryStory } = await import('./story-memory-longrun-fixture.mjs');
    await verifyLongMemoryStory({ client, database, worker, base, fixture: fixture.longrun, check });
    await batch(fixture.partial, 1);
    assert.equal((await getJobs(fixture.partial)).length, 0);
    const fifth = await turn(fixture.partial);
    const [partialJob] = await getJobs(fixture.partial);
    assert.ok(partialJob);
    const selectedEvents = await client`SELECT status FROM story_events WHERE id = ANY(${partialJob.source_event_ids}::uuid[])`;
    assert.ok(selectedEvents.every(event => event.status === 'confirmed'));
    check('Partial batch progress survives process restart and excludes interrupted replies');
    await commitStoryTurn(fifth.prepared, fifth.inputId, fifth.requestId, fifth.reply, false, database);
    assert.equal((await getJobs(fixture.partial)).length, 1);
    assert.equal(await worker().runOnce(), 'succeeded');
    assert.equal(await worker().runOnce(), 'idle');
    check('Replaying an already committed turn creates no duplicate job or memory');

    const atomic = await createChat();
    await batch(atomic, 4);
    const rollback = new Error('expected enclosing transaction rollback');
    await assert.rejects(database.transaction(async transaction => {
      await turn(atomic, false, undefined, transaction);
      throw rollback;
    }), error => error === rollback);
    assert.equal((await getJobs(atomic)).length, 0);
    assert.equal((await client`SELECT cardinality(event_ids) AS count FROM story_memory_progress WHERE chat_id = ${atomic.id}`)[0].count, 4);
    await turn(atomic);
    assert.equal(await worker().runOnce(), 'succeeded');
    check('Enqueue and progress roll back with the story turn and recover on a subsequent commit');

    const concurrent = await freshJob();
    await client`UPDATE story_memory_jobs SET status = 'running', attempts = 1, lease_token = ${randomUUID()}, lease_until = now() - interval '1 second' WHERE id = ${concurrent.job.id}`;
    const simultaneous = await Promise.all([worker().runOnce(), worker().runOnce()]);
    assert.deepEqual(simultaneous.sort(), ['idle', 'succeeded']);
    assert.equal((await stored(concurrent.chat)).length, 1);
    check('A crashed lease is reclaimed by only one of two concurrent workers');

    const stale = await freshJob();
    const pause = gate();
    const callsBeforeStale = extractions;
    const oldWorker = worker({ embed: async texts => { await pause.wait(); return texts.map(() => embedding); } }).runOnce();
    await pause.entered;
    await client`UPDATE story_memory_jobs SET lease_until = now() - interval '1 second' WHERE id = ${stale.job.id}`;
    assert.equal(await worker().runOnce(), 'succeeded');
    pause.release();
    assert.equal(await oldWorker, 'superseded');
    assert.equal(extractions, callsBeforeStale + 1);
    assert.equal((await stored(stale.chat)).length, 1);
    assert.equal((await client`SELECT * FROM character_memory_vectors WHERE memory_id = ${(await stored(stale.chat))[0].id}`).length, 1);
    check('An expired worker cannot commit after replacement; checkpoint reuse avoids a second extraction');

    const invalid = await freshJob();
    const beforeInvalid = extractions;
    assert.equal(await worker({ embed: async texts => texts.map(() => new Array(384).fill(0)) }).runOnce(), 'retry');
    await assertEmpty(invalid.chat);
    assert.equal((await getJobs(invalid.chat))[0].error_code, 'EMBEDDING_INVALID');
    await due(invalid.job);
    assert.equal(await worker().runOnce(), 'succeeded');
    assert.equal(extractions, beforeInvalid + 1);
    check('Zero vectors are failures; embedding recovery reuses extraction and writes no partial memory');

    const badSource = await freshJob();
    const forged = { extract: async () => [{ type: 'event', content: 'invented source', sourceMessageIds: [fifth.message.id] }] };
    assert.equal(await worker(forged, { maxAttempts: 2 }).runOnce(), 'retry');
    await due(badSource.job);
    assert.equal(await worker(forged, { maxAttempts: 2 }).runOnce(), 'failed');
    await assertEmpty(badSource.chat);
    assert.equal((await getJobs(badSource.chat))[0].attempts, 2);
    assert.equal(await worker().runOnce(), 'idle');
    check('Cross-story source references are rejected and retries stop at the configured cap');
    const inspected = await inspectStoryMemoryJob(client, badSource.job.id);
    assert.equal(inspected.status, 'failed');
    assert.equal(inspected.has_checkpoint, false);
    await assert.rejects(retryStoryMemoryJob(client, badSource.job.id, 1), /REVIEW_STALE/);
    const replayed = await retryStoryMemoryJob(client, badSource.job.id, 2);
    assert.equal(replayed.replays, 1);
    assert.equal(replayed.status, 'retry');
    assert.equal(await worker().runOnce(), 'succeeded');
    const history = (await getJobs(badSource.chat))[0].replay_history;
    assert.equal(history[0].attempts, 2);
    assert.equal(history[0].errorCode, 'EXTRACTION_INVALID');
    await assert.rejects(retryStoryMemoryJob(client, badSource.job.id, 1), /REVIEW_STALE/);
    check('Explicit failed-job replay retains attempt history, checks reviewed state and cannot replay completed work');

    const empty = await freshJob();
    assert.equal(await worker({ extract: async () => [], embed: async () => { throw new Error('empty facts must not embed'); } }).runOnce(), 'succeeded');
    await assertEmpty(empty.chat);
    check('A valid empty extraction succeeds without embedding or a fabricated memory');

    const timeout = await freshJob();
    assert.equal(await worker({ extract: async (_sources, signal) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }) }, { timeoutMs: 10, maxAttempts: 1 }).runOnce(), 'failed');
    await assertEmpty(timeout.chat);
    check('Extraction has an abort deadline and a failed attempt is recorded');

    const budget = await freshJob();
    const beforeBudget = extractions;
    assert.equal(await worker({}, { maxInputChars: 100 }).runOnce(), 'failed');
    assert.equal(extractions, beforeBudget);
    assert.equal((await getJobs(budget.chat))[0].error_code, 'INPUT_BUDGET_EXCEEDED');
    check('Over-budget sources stop visibly without truncation or a provider call');

    const changed = await freshJob();
    assert.equal(await worker({ embed: async texts => {
      await client`UPDATE messages SET content = '原文已经变化' WHERE id = (SELECT message_id FROM story_events WHERE id = ${changed.job.source_event_ids[0]})`;
      return texts.map(() => embedding);
    } }).runOnce(), 'failed');
    await assertEmpty(changed.chat);
    assert.equal((await getJobs(changed.chat))[0].error_code, 'SOURCE_CHANGED');
    await assert.rejects(retryStoryMemoryJob(client, changed.job.id, 1), /SOURCE_REQUIRES_REVIEW/);
    check('Editing source text during embedding prevents stale derived memory from committing');

    const mismatched = await freshJob();
    const beforeMismatch = extractions;
    await client`UPDATE messages SET extra = extra || '{"storyVersion":99999}'::jsonb
      WHERE id = (SELECT message_id FROM story_events WHERE id = ${mismatched.job.source_event_ids[0]})`;
    assert.equal(await worker().runOnce(), 'failed');
    assert.equal(extractions, beforeMismatch);
    assert.equal((await getJobs(mismatched.chat))[0].error_code, 'SOURCE_UNAVAILABLE');
    await assertEmpty(mismatched.chat);
    check('A message/event version mismatch is rejected before any extraction call');

    const rollbackJob = await freshJob();
    const beforeRollback = extractions;
    await client.unsafe(`CREATE FUNCTION reject_memory_vector_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'controlled vector commit failure'; END; $$;
      CREATE TRIGGER reject_memory_vector_fixture BEFORE INSERT ON character_memory_vectors FOR EACH ROW EXECUTE FUNCTION reject_memory_vector_fixture()`);
    try {
      assert.equal(await worker().runOnce(), 'retry');
      await assertEmpty(rollbackJob.chat);
      assert.equal((await client`SELECT * FROM story_memory_links WHERE job_id = ${rollbackJob.job.id}`).length, 0);
    } finally {
      await client.unsafe('DROP TRIGGER reject_memory_vector_fixture ON character_memory_vectors; DROP FUNCTION reject_memory_vector_fixture()');
    }
    await due(rollbackJob.job);
    assert.equal(await worker().runOnce(), 'succeeded');
    assert.equal(extractions, beforeRollback + 1);
    check('A database failure rolls back memory, vector and provenance together; retry uses the saved extraction');

    const deleted = await freshJob();
    const deletionGate = gate();
    const lateWorker = worker({ extract: async sources => { await deletionGate.wait(); return providers.extract(sources); } }).runOnce();
    await deletionGate.entered;
    await database.delete(schema.chats).where(eq(schema.chats.id, deleted.chat.id));
    deletionGate.release();
    assert.equal(await lateWorker, 'superseded');
    await assertEmpty(deleted.chat);
    assert.equal((await getJobs(deleted.chat)).length, 0);
    assert.equal((await client`SELECT * FROM story_memory_progress WHERE chat_id = ${deleted.chat.id}`).length, 0);
    check('Deleting a story during extraction cascades work and rejects late completion without resurrection');

    const [secondary] = await database.insert(schema.characters).values({ tenantId: base.tenantId, creatorId: base.userId, name: '记忆验收副角色', cardData: {} }).returning();
    const [primary] = await database.insert(schema.characters).values({ tenantId: base.tenantId, creatorId: base.userId, name: '记忆验收主角色', cardData: {} }).returning();
    const group = await createChat([primary.id, secondary.id]);
    await batch(group, 4, primary.id);
    await batch(group, 4, secondary.id);
    assert.equal((await getJobs(group)).length, 0);
    await turn(group, false, primary.id);
    await turn(group, false, secondary.id);
    assert.equal((await getJobs(group)).length, 2);
    assert.equal(await worker().runOnce(), 'succeeded');
    assert.equal(await worker().runOnce(), 'succeeded');
    assert.deepEqual((await stored(group)).map(memory => memory.character_id).sort(), [primary.id, secondary.id].sort());
    check('Group participants count and derive independently within the same story');
    const { getStoryMemoryView } = await import('../src/server/services/story-memory-view.service.ts');
    const groupView = await getStoryMemoryView(group.id, base.userId, base.tenantId, undefined, database);
    assert.equal(groupView.counts.succeeded, 2);
    assert.deepEqual(groupView.jobs.map(job => job.characterName).sort(), [primary.name, secondary.name].sort());
    assert.ok(groupView.jobs.every(job => job.sourcesAvailable && job.sources.length === 5 && job.retainedMemories === 1));
    assert.equal(new Set(groupView.jobs.flatMap(job => job.sources.map(source => source.messageId))).size, 10);
    check('Group memory progress shows each frozen character and only their own five confirmed reply sources');
    for (const character of [primary, secondary]) {
      const summaries = await readSummaries(group.id, base.userId, base.tenantId, character.id, database);
      assert.equal(summaries.length, 1);
      const ownJob = groupView.jobs.find(job => job.characterName === character.name);
      assert.deepEqual(summaries[0].sourceMessageIds, ownJob.sources.flatMap(source => [source.inputMessageId, source.messageId]));
    }
    check('Group recap retrieval includes only the responding character\'s confirmed input/reply sources');

    const exhausted = await freshJob();
    await client`UPDATE story_memory_jobs SET status = 'running', attempts = 3, lease_token = ${randomUUID()}, lease_until = now() - interval '1 second' WHERE id = ${exhausted.job.id}`;
    assert.equal(await worker().runOnce(), 'idle');
    assert.equal((await getJobs(exhausted.chat))[0].status, 'failed');
    check('A repeatedly crashed job stops at the retry cap instead of being claimed forever');

    const reduced = await freshJob();
    assert.equal(await worker({ extract: async () => { throw new Error('controlled outage'); } }).runOnce(), 'retry');
    assert.equal(await worker({}, { maxAttempts: 1 }).runOnce(), 'idle');
    assert.equal((await getJobs(reduced.chat))[0].status, 'failed');
    check('Lowering the retry limit marks already exhausted queued work as failed instead of stranding it');

    const beforeOther = await stored(fixture.checkpoint);
    await database.delete(schema.chats).where(eq(schema.chats.id, fixture.complete.id));
    assert.deepEqual(await stored(fixture.checkpoint), beforeOther);
    assert.equal((await client`SELECT count(*)::int AS count FROM story_memory_links link
      JOIN character_memories memory ON memory.id = link.memory_id JOIN story_events event ON event.id = link.event_id
      JOIN messages message ON message.id = link.message_id JOIN story_memory_jobs job ON job.id = link.job_id
      WHERE memory.source_chat_id <> event.chat_id OR message.chat_id <> event.chat_id OR job.chat_id <> event.chat_id OR event.status <> 'confirmed'`)[0].count, 0);
    check('Deleting completed work preserves other stories and every remaining provenance link stays in its confirmed story');
    await assert.rejects(readSummaries(fixture.complete.id, base.userId, base.tenantId, base.characterId, database), error => error.statusCode === 404);
    check('Deleting a completed story removes its saved recap from continuation reads');
    const { checkStoryMemoryView } = await import('./story-memory-view-fixture.mjs');
    await checkStoryMemoryView({ database, client, creation, base, completedChatId: fixture.checkpoint.id, check });
    const { checkStoryMemoryBackfill } = await import('./story-memory-backfill-fixture.mjs');
    await checkStoryMemoryBackfill({ client, database, base, createChat, batch, turn, worker, getJobs, check, groupCharacterIds: [primary.id, secondary.id] });
    const { checkLargeMemoryHistory } = await import('./story-memory-large-history-fixture.mjs');
    await checkLargeMemoryHistory({ client, base, createChat, check });
    const { checkStoryMemoryContinuity } = await import('./story-memory-continuity-fixture.mjs');
    await checkStoryMemoryContinuity({ client, database, base, createChat, batch, worker, check });
    await writeFile(process.env.STORY_MEMORY_BEHAVIOR, JSON.stringify({ checks, extraction: 'controlled provider; no real model calls', embedding: 'fixed nonzero 384-dimensional vectors', extractions }, null, 2), { mode: 0o600 });
    console.info(`${checks.length} durable memory checks passed`);
  }
} finally {
  await client.end();
}
