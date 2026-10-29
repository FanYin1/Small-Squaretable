import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inspectStoryMemoryHistory, backfillStoryMemoryHistory } from './story-memory-backfill.mjs';

export async function checkStoryMemoryBackfill({ client, database, base, createChat, batch, turn, worker, getJobs, check, groupCharacterIds }) {
  const scopeFor = chat => ({ chatId: chat.id, characterId: base.characterId });
  const chat = await createChat();
  await batch(chat, 8);
  const [omitted] = await getJobs(chat);
  await client`DELETE FROM story_memory_jobs WHERE id = ${omitted.id}`;
  const scope = scopeFor(chat);
  const before = await client`SELECT * FROM story_memory_progress WHERE chat_id = ${chat.id}`;
  const review = await inspectStoryMemoryHistory(client, scope);
  assert.equal(review.missingReplies, 5); assert.equal(review.jobsToCreate, 1); assert.equal(review.remainingProgress, 3);
  assert.equal((await getJobs(chat)).length, 0);
  assert.deepEqual(await client`SELECT * FROM story_memory_progress WHERE chat_id = ${chat.id}`, before);
  assert.ok(!JSON.stringify(review).includes('灯塔'));
  check('Backfill inspection detects missing historical batches without writes or disclosure of dialogue');
  const execute = promisify(execFile);
  const cliArgs = ['scripts/story-memory-backfill.mjs', '--chat', chat.id, '--character', base.characterId];
  const inspected = await execute(process.execPath, cliArgs);
  assert.deepEqual(JSON.parse(inspected.stdout), review);
  await assert.rejects(execute(process.execPath, [...cliArgs, '--apply']), error => error.code === 1 && error.stderr.trim() === 'MEMORY_BACKFILL_ARGUMENTS_INVALID');
  await assert.rejects(execute(process.execPath, [...cliArgs, '--force']), error => error.code === 1 && error.stderr.trim() === 'MEMORY_BACKFILL_ARGUMENTS_INVALID');
  assert.equal((await getJobs(chat)).length, 0);
  check('Operator CLI defaults to inspection and rejects missing review tokens or unknown force flags without writes');
  const applied = JSON.parse((await execute(process.execPath, [...cliArgs, '--apply', '--expected-review', review.reviewHash])).stdout);
  assert.equal(applied.createdJobs, 1);
  assert.deepEqual((await getJobs(chat))[0].source_event_ids, omitted.source_event_ids);
  assert.deepEqual(await client`SELECT * FROM story_memory_progress WHERE chat_id = ${chat.id}`, before);
  await assert.rejects(backfillStoryMemoryHistory(client, scope, review.reviewHash), /REVIEW_STALE/);
  const repeat = await inspectStoryMemoryHistory(client, scope);
  assert.equal((await backfillStoryMemoryHistory(client, scope, repeat.reviewHash)).createdJobs, 0);
  check('Reviewed backfill creates only omitted batches; replay cannot duplicate jobs or regroup covered events');
  assert.equal(await worker().runOnce(), 'succeeded');
  const { getStorySummaries } = await import('../src/server/services/story-summary.service.ts');
  assert.equal((await getStorySummaries(chat.id, base.userId, base.tenantId, base.characterId, database)).length, 1);
  check('Backfilled pending jobs run through the real worker and become source-validated continuation summaries');
  const existing = await getJobs(chat);
  await batch(chat, 2);
  const afterTurns = await getJobs(chat);
  assert.equal(afterTurns.length, 2);
  assert.deepEqual(afterTurns[0], existing[0]);
  assert.equal(new Set(afterTurns.flatMap(job => job.source_event_ids)).size, 10);
  check('Live event enqueue continues from retained partial progress after backfill without duplicate sources');
  const stale = await inspectStoryMemoryHistory(client, scope);
  await turn(chat);
  const unchanged = await getJobs(chat);
  await assert.rejects(backfillStoryMemoryHistory(client, scope, stale.reviewHash), /REVIEW_STALE/);
  assert.deepEqual(await getJobs(chat), unchanged);
  const edited = await inspectStoryMemoryHistory(client, scope);
  const [input] = await client`SELECT id, content FROM messages WHERE chat_id = ${chat.id} AND role = 'user' ORDER BY id LIMIT 1`;
  await client`UPDATE messages SET content = 'source edited after review' WHERE id = ${input.id}`;
  await assert.rejects(backfillStoryMemoryHistory(client, scope, edited.reviewHash), /REVIEW_STALE/);
  await client`UPDATE messages SET content = ${input.content} WHERE id = ${input.id}`;
  check('New confirmed turns and source edits invalidate a reviewed backfill before any queue changes');

  const concurrent = await createChat();
  await batch(concurrent);
  await client`DELETE FROM story_memory_jobs WHERE chat_id = ${concurrent.id}`;
  const concurrentScope = scopeFor(concurrent);
  const concurrentReview = await inspectStoryMemoryHistory(client, concurrentScope);
  const results = await Promise.allSettled([backfillStoryMemoryHistory(client, concurrentScope, concurrentReview.reviewHash),
    backfillStoryMemoryHistory(client, concurrentScope, concurrentReview.reviewHash)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && /REVIEW_STALE/.test(result.reason.message)).length, 1);
  assert.equal((await getJobs(concurrent)).length, 1);
  check('Concurrent reviewed backfills serialize per story and create each missing batch once');
  await client`UPDATE story_memory_jobs SET status = 'failed', attempts = 3, error_code = 'EXTRACTION_FAILED' WHERE chat_id = ${concurrent.id}`;
  const failedJobs = await getJobs(concurrent);
  const failedReview = await inspectStoryMemoryHistory(client, concurrentScope);
  assert.equal(failedReview.missingReplies, 0);
  assert.equal((await backfillStoryMemoryHistory(client, concurrentScope, failedReview.reviewHash)).createdJobs, 0);
  assert.deepEqual(await getJobs(concurrent), failedJobs);
  check('Failed jobs still count as covered and backfill cannot bypass their explicit retry policy');
  await client.begin(async transaction => {
    await transaction`SELECT chat_id FROM story_states WHERE chat_id = ${concurrent.id} FOR UPDATE`;
    await assert.rejects(backfillStoryMemoryHistory(client, concurrentScope, failedReview.reviewHash), error => error.code === '55P03');
  });
  assert.deepEqual(await getJobs(concurrent), failedJobs);
  check('An occupied story commit lock causes bounded backfill failure without partial queue changes');
  const lowestId = '00000000-0000-0000-0000-000000000000';
  await client`UPDATE story_memory_jobs SET id = ${lowestId} WHERE id = ${failedJobs[0].id}`;
  const lowestReview = await inspectStoryMemoryHistory(client, concurrentScope);
  assert.equal(lowestReview.existingJobs, 1); assert.equal(lowestReview.missingReplies, 0);
  await client`UPDATE story_memory_jobs SET id = ${failedJobs[0].id} WHERE id = ${lowestId}`;
  check('The first job page includes the minimum UUID instead of treating its covered sources as missing');

  const group = await createChat(groupCharacterIds);
  for (const characterId of groupCharacterIds) await batch(group, 5, characterId);
  const otherJobs = await client`SELECT * FROM story_memory_jobs WHERE chat_id = ${group.id} AND character_id = ${groupCharacterIds[1]}`;
  await client`DELETE FROM story_memory_jobs WHERE chat_id = ${group.id} AND character_id = ${groupCharacterIds[0]}`;
  const groupScope = { chatId: group.id, characterId: groupCharacterIds[0] };
  const groupReview = await inspectStoryMemoryHistory(client, groupScope);
  assert.equal(groupReview.confirmedReplies, 5);
  await backfillStoryMemoryHistory(client, groupScope, groupReview.reviewHash);
  assert.deepEqual(await client`SELECT * FROM story_memory_jobs WHERE chat_id = ${group.id} AND character_id = ${groupCharacterIds[1]}`, otherJobs);
  const groupJobs = await getJobs(group);
  assert.equal(groupJobs.length, 2); assert.equal(new Set(groupJobs.flatMap(job => job.source_event_ids)).size, 10);
  check('Group backfill repairs only the selected frozen character and preserves the other participant\'s jobs');

  const rollback = await createChat();
  await batch(rollback, 13);
  const rollbackJobs = await getJobs(rollback);
  await client`DELETE FROM story_memory_jobs WHERE chat_id = ${rollback.id}`;
  const rollbackScope = scopeFor(rollback);
  const rollbackReview = await inspectStoryMemoryHistory(client, rollbackScope);
  const rollbackProgress = await client`SELECT * FROM story_memory_progress WHERE chat_id = ${rollback.id}`;
  await client.unsafe(`CREATE FUNCTION reject_backfill_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.chat_id = '${rollback.id}'::uuid AND '${rollbackJobs[1].source_event_ids[0]}'::uuid = ANY(NEW.source_event_ids) THEN
      RAISE EXCEPTION 'controlled backfill write failure'; END IF; RETURN NEW; END; $$`);
  await client`CREATE TRIGGER reject_backfill_fixture BEFORE INSERT ON story_memory_jobs FOR EACH ROW EXECUTE FUNCTION reject_backfill_fixture()`;
  try {
    await assert.rejects(backfillStoryMemoryHistory(client, rollbackScope, rollbackReview.reviewHash), /controlled backfill write failure/);
    assert.equal((await getJobs(rollback)).length, 0);
    assert.deepEqual(await client`SELECT * FROM story_memory_progress WHERE chat_id = ${rollback.id}`, rollbackProgress);
  } finally {
    await client`DROP TRIGGER reject_backfill_fixture ON story_memory_jobs`;
    await client`DROP FUNCTION reject_backfill_fixture()`;
  }
  assert.equal((await backfillStoryMemoryHistory(client, rollbackScope, rollbackReview.reviewHash)).createdJobs, 2);
  check('A failure on the second batch rolls back all inserts and progress; the same reviewed plan can then recover');

  const partial = await createChat();
  await batch(partial, 3); await turn(partial, true);
  await client`DELETE FROM story_memory_progress WHERE chat_id = ${partial.id}`;
  const partialScope = scopeFor(partial);
  const partialReview = await inspectStoryMemoryHistory(client, partialScope);
  assert.equal(partialReview.confirmedReplies, 3); assert.equal(partialReview.missingReplies, 3);
  await backfillStoryMemoryHistory(client, partialScope, partialReview.reviewHash);
  await batch(partial, 2);
  assert.equal((await getJobs(partial)).length, 1);
  check('Missing partial progress is restored and interrupted replies never count toward a backfilled batch');

  const corrupted = await getJobs(concurrent);
  await client`UPDATE story_memory_jobs SET source_event_ids = ${Array(5).fill(corrupted[0].source_event_ids[0])} WHERE id = ${corrupted[0].id}`;
  await assert.rejects(inspectStoryMemoryHistory(client, concurrentScope), /COVERAGE_INVALID/);
  await client`UPDATE story_memory_jobs SET source_event_ids = ${corrupted[0].source_event_ids} WHERE id = ${corrupted[0].id}`;
  const [reply] = await client`SELECT id, extra FROM messages WHERE chat_id = ${concurrent.id} AND role = 'assistant' ORDER BY id LIMIT 1`;
  await client`UPDATE messages SET extra = '{}'::jsonb WHERE id = ${reply.id}`;
  await assert.rejects(inspectStoryMemoryHistory(client, concurrentScope), /SOURCE_INVALID/);
  await client`UPDATE messages SET extra = ${JSON.stringify(reply.extra)}::jsonb WHERE id = ${reply.id}`;
  check('Corrupt coverage and unconfirmed reply metadata stop backfill rather than inventing replacement evidence');

  await assert.rejects(inspectStoryMemoryHistory(client, { ...scope, characterId: randomUUID() }), /CHARACTER_UNAVAILABLE/);
  await assert.rejects(inspectStoryMemoryHistory(client, { ...scope, chatId: randomUUID() }), /STORY_NOT_FOUND/);
  const [legacy] = await client`INSERT INTO chats (user_id, tenant_id, character_id) VALUES (${base.userId}, ${base.tenantId}, ${base.characterId}) RETURNING id`;
  await assert.rejects(inspectStoryMemoryHistory(client, scopeFor(legacy)), /LEGACY_UNSUPPORTED/);
  await client`DELETE FROM chats WHERE id = ${legacy.id}`;
  const deletedReview = await inspectStoryMemoryHistory(client, concurrentScope);
  await client`DELETE FROM chats WHERE id = ${concurrent.id}`;
  await assert.rejects(backfillStoryMemoryHistory(client, concurrentScope, deletedReview.reviewHash), /STORY_NOT_FOUND/);
  assert.equal((await getJobs(concurrent)).length, 0);
  check('Unsupported legacy stories, unrelated characters and deleted stories cannot be backfilled or resurrected');

  for (const current of [chat, partial, group, rollback]) await client`DELETE FROM chats WHERE id = ${current.id}`;
}
