import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function checkStorySummaries({ database, client, base, chatId, check }) {
  const { getStorySummaries } = await import('../src/server/services/story-summary.service.ts');
  const read = () => getStorySummaries(chatId, base.userId, base.tenantId, base.characterId, database);
  const summaries = await read();
  assert.equal(summaries.length, 1);
  assert.match(summaries[0].content, /SUMMARY_LIGHTHOUSE_MEETING/);
  assert.equal(summaries[0].sourceMessageIds.length, 10);
  check('Versioned batch recap survives full backup/restore and checkpoint resume with its ten source messages');
  await assert.rejects(getStorySummaries(chatId, randomUUID(), base.tenantId, base.characterId, database), error => error.statusCode === 404);
  await assert.rejects(getStorySummaries(chatId, base.userId, randomUUID(), base.characterId, database), error => error.statusCode === 404);
  assert.deepEqual(await getStorySummaries(chatId, base.userId, base.tenantId, randomUUID(), database), []);
  check('Recap retrieval is isolated by owner, tenant, story and responding character');
  const [job] = await client`SELECT * FROM story_memory_jobs WHERE id = ${summaries[0].jobId}`;
  for (const status of ['pending', 'running', 'retry', 'failed']) {
    await client`UPDATE story_memory_jobs SET status = ${status} WHERE id = ${job.id}`;
    assert.deepEqual(await read(), []);
  }
  await client`UPDATE story_memory_jobs SET status = 'succeeded' WHERE id = ${job.id}`;
  check('Pending, running, retry and failed checkpoints cannot supply recaps to generation');
  const [source] = await client`SELECT id, content FROM messages WHERE id = ${summaries[0].sourceMessageIds[0]}`;
  await client`UPDATE messages SET content = 'changed after extraction' WHERE id = ${source.id}`;
  assert.deepEqual(await read(), []);
  await client`UPDATE messages SET content = ${source.content} WHERE id = ${source.id}`;
  assert.equal((await read()).length, 1);
  check('Changed source text invalidates a completed recap even if IDs and event versions still match');
  const variants = [job.extracted.facts,
    { ...job.extracted, summary: { content: 'Invalid source', sourceMessageIds: [Number.MAX_SAFE_INTEGER] } },
    { ...job.extracted, version: 999 }];
  for (const value of variants) {
    await client`UPDATE story_memory_jobs SET extracted = ${JSON.stringify(value)}::jsonb WHERE id = ${job.id}`;
    assert.deepEqual(await read(), []);
  }
  await client`UPDATE story_memory_jobs SET extracted = ${JSON.stringify(job.extracted)}::jsonb WHERE id = ${job.id}`;
  check('Legacy fact-only checkpoints and malformed recap versions or references are not treated as summaries');
  await client`UPDATE story_memory_jobs SET source_digest = null WHERE id = ${job.id}`;
  assert.deepEqual(await read(), []);
  await client`UPDATE story_memory_jobs SET source_digest = ${job.source_digest} WHERE id = ${job.id}`;
  check('A recap without a persisted source digest is excluded rather than trusted');
}
