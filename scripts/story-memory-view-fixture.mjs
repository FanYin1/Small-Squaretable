import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function checkStoryMemoryView({ database, client, creation, base, completedChatId, check }) {
  const { getStoryMemoryView } = await import('../src/server/services/story-memory-view.service.ts');
  const { prepareStoryTurn, commitStoryTurn } = await import('../src/server/services/story-state.service.ts');
  const { messages } = await import('../src/db/schema/chats.ts');
  const read = (chatId, before) => getStoryMemoryView(chatId, base.userId, base.tenantId, before, database);
  const saved = await read(completedChatId);
  assert.equal(saved.jobs[0].status, 'succeeded');
  assert.equal(saved.jobs[0].retainedMemories, 1);
  assert.equal(saved.jobs[0].sources.length, 5);
  assert.ok(saved.jobs[0].sources.every(source => source.inputMessageId !== source.messageId));
  assert.equal(saved.counts.succeeded, 1);
  check('Player view exposes real successful batch provenance and retained counts without returning memory text');
  for (const [userId, tenantId] of [[randomUUID(), base.tenantId], [base.userId, randomUUID()]]) {
    await assert.rejects(getStoryMemoryView(completedChatId, userId, tenantId, undefined, database), error => error.statusCode === 404);
  }
  check('Player memory reads reject another owner or tenant before loading jobs');
  const chat = (await creation.create(base.userId, base.tenantId, { characterIds: [base.characterId], clientRequestId: randomUUID() })).chat;
  assert.equal((await read(chat.id)).jobs.length, 0);
  const turns = [];
  for (let index = 0; index < 5; index++) {
    const prepared = await prepareStoryTurn(chat, '读取进度验收。', undefined, database);
    const [input] = await database.insert(messages).values({ chatId: chat.id, role: 'user', content: '公开输入。' }).returning();
    const reply = await commitStoryTurn(prepared, input.id, randomUUID(), '公开回应。', false, database);
    turns.push({ input, reply });
    if (index === 2) {
      const partial = await read(chat.id);
      assert.equal(partial.accumulating[0].turns, 3); assert.equal(partial.jobs.length, 0);
      check('Progress shows three confirmed replies before reaching the five-reply batch threshold');
    }
  }
  const [job] = await client`SELECT * FROM story_memory_jobs WHERE chat_id = ${chat.id}`;
  const publicBefore = await read(chat.id);
  await client`UPDATE story_memory_jobs SET extracted = ${JSON.stringify([{ content: 'PRIVATE_EXTRACTION' }])}::jsonb, error_code = 'PRIVATE_PROVIDER_ERROR',
    replay_history = ${JSON.stringify([{ details: 'PRIVATE_REPLAY' }])}::jsonb WHERE id = ${job.id}`;
  assert.deepEqual(await read(chat.id), publicBefore);
  check('Extracted checkpoints, failure internals, digests and replay details never enter the player response');
  await client`UPDATE story_memory_jobs SET source_digest = 'PRIVATE_CHANGED_DIGEST' WHERE id = ${job.id}`;
  const changed = await read(chat.id);
  assert.equal(changed.jobs[0].sourcesAvailable, false); assert.deepEqual(changed.jobs[0].sources, []);
  assert.ok(!JSON.stringify(changed).includes('PRIVATE_'));
  await client`UPDATE story_memory_jobs SET source_digest = null WHERE id = ${job.id}`;
  check('A source digest mismatch withholds references and never exposes the private digest');
  for (const status of ['running', 'retry', 'failed', 'succeeded']) {
    await client`UPDATE story_memory_jobs SET status = ${status}, lease_until = now() - interval '1 second' WHERE id = ${job.id}`;
    const view = await read(chat.id);
    assert.equal(view.jobs[0].status, status); assert.equal(view.counts[status], 1);
    assert.equal(view.jobs[0].recoveryPending, status === 'running');
    assert.equal(view.jobs[0].retainedMemories, 0);
  }
  check('Queued, expired-running, retry, failed and completed-with-no-retained-memory states remain distinguishable');
  await assert.rejects(read(chat.id, saved.jobs[0].id), error => error.code === 'STORY_MEMORY_CURSOR_INVALID');
  await assert.rejects(read(chat.id, randomUUID()), error => error.code === 'STORY_MEMORY_CURSOR_INVALID');
  check('Foreign and missing pagination cursors fail identically');
  function permutations(values) {
    return values.length === 1 ? [values] : values.flatMap((value, index) => permutations(values.filter((_, position) => position !== index)).map(rest => [value, ...rest]));
  }
  for (const ids of permutations(job.source_event_ids).slice(1, 23)) {
    await client`INSERT INTO story_memory_jobs (chat_id, character_id, source_event_ids, status) VALUES (${chat.id}, ${base.characterId}, ${ids}, 'succeeded')`;
  }
  await client`UPDATE story_memory_jobs SET created_at = '2026-10-24T01:00:00.123456Z'::timestamptz WHERE chat_id = ${chat.id}`;
  const first = await read(chat.id);
  const second = await read(chat.id, first.nextBefore);
  assert.equal(first.jobs.length, 20); assert.equal(second.jobs.length, 3); assert.equal(second.nextBefore, null);
  assert.equal(new Set([...first.jobs, ...second.jobs].map(item => item.id)).size, 23);
  assert.equal(first.counts.succeeded, 23); assert.equal(second.counts.succeeded, 23);
  check('Bounded pagination preserves all batches sharing the same microsecond timestamp and global counts');
  const [foreignEvent] = await client`SELECT id FROM story_events WHERE chat_id = ${completedChatId} LIMIT 1`;
  await client`UPDATE story_memory_jobs SET source_event_ids = ${[foreignEvent.id, ...job.source_event_ids.slice(1)]} WHERE id = ${job.id}`;
  const unsafe = [...(await read(chat.id)).jobs, ...(await read(chat.id, first.nextBefore)).jobs].find(item => item.id === job.id);
  assert.equal(unsafe.sourcesAvailable, false); assert.deepEqual(unsafe.sources, []);
  check('Cross-story event references are withheld rather than becoming player source links');
  await client`UPDATE story_memory_jobs SET source_event_ids = ${job.source_event_ids} WHERE id = ${job.id}`;
  await client`UPDATE messages SET extra = ${JSON.stringify({ stateStatus: 'interrupted' })}::jsonb WHERE id = ${turns[0].reply.id}`;
  assert.ok((await read(chat.id)).jobs.every(item => !item.sourcesAvailable && item.sources.length === 0));
  check('Interrupted or version-mismatched replies cannot be presented as confirmed memory provenance');
  const legacyId = randomUUID();
  await client`INSERT INTO chats (id, user_id, tenant_id, title) VALUES (${legacyId}, ${base.userId}, ${base.tenantId}, '旧故事验收')`;
  const legacy = await read(legacyId); assert.equal(legacy.supported, false); assert.deepEqual(legacy.jobs, []);
  check('Legacy stories explicitly report unsupported progress without inventing historical coverage');
  await client`DELETE FROM chats WHERE id = ${chat.id}`;
  await assert.rejects(read(chat.id), error => error.statusCode === 404);
  check('Deleted stories cannot return remembered progress or stale source IDs');
}
