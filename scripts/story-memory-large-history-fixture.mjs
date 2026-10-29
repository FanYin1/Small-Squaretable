import assert from 'node:assert/strict';
import { inspectStoryMemoryHistory, backfillStoryMemoryHistory } from './story-memory-backfill.mjs';

export async function checkLargeMemoryHistory({ client, base, createChat, check }) {
  const chat = await createChat();
  const scope = { chatId: chat.id, characterId: base.characterId };
  try {
    await client`INSERT INTO messages (chat_id, role, content, extra)
      SELECT ${chat.id}, 'user', repeat('合成资料', 110), jsonb_build_object('fixtureVersion', version)
      FROM generate_series(1, 5003) AS version`;
    await client`INSERT INTO messages (chat_id, role, content, extra)
      SELECT ${chat.id}, 'assistant', '合成回应，约定尚未发生。',
        jsonb_build_object('stateStatus', 'confirmed', 'storyVersion', version, 'storyRequestId', 'large-fixture-' || version)
      FROM generate_series(1, 5003) AS version`;
    await client`INSERT INTO story_events (chat_id, request_id, version, status, input_message_id, message_id, changes, excerpt)
      SELECT ${chat.id}, reply.extra->>'storyRequestId', (reply.extra->>'storyVersion')::int, 'confirmed', input.id, reply.id, '{}', '合成大历史'
      FROM messages input JOIN messages reply ON input.chat_id = reply.chat_id AND input.extra->'fixtureVersion' = reply.extra->'storyVersion'
      WHERE input.chat_id = ${chat.id} AND input.role = 'user' AND reply.role = 'assistant' ORDER BY (reply.extra->>'storyVersion')::int`;
    await client`UPDATE story_states SET version = 5003 WHERE chat_id = ${chat.id}`;
    await client`DELETE FROM story_memory_jobs WHERE chat_id = ${chat.id}`;
    const first = await inspectStoryMemoryHistory(client, scope);
    assert.equal(first.confirmedReplies, 5003); assert.equal(first.jobsToCreate, 100); assert.equal(first.deferredJobs, 900);
    assert.equal(first.remainingProgress, 3);
    check('Paged inspection covers 5003 confirmed turns and over two million source characters without returning raw dialogue');
    await assert.rejects(backfillStoryMemoryHistory(client, { ...scope, maxJobs: 1 }, first.reviewHash), /REVIEW_STALE/);
    let review = first;
    let applications = 0;
    while (review.jobsToCreate) {
      assert.ok(applications < 10);
      const applied = await backfillStoryMemoryHistory(client, scope, review.reviewHash);
      assert.equal(applied.createdJobs, 100);
      applications++;
      review = await inspectStoryMemoryHistory(client, scope);
    }
    assert.equal(applications, 10); assert.equal(review.existingJobs, 1000);
    assert.equal(review.deferredJobs, 0); assert.equal(review.missingReplies, 0); assert.equal(review.existingProgress, 3);
    const [coverage] = await client`SELECT count(*)::int AS count, count(DISTINCT event_id)::int AS distinct_count
      FROM story_memory_jobs, unnest(source_event_ids) AS event_id WHERE chat_id = ${chat.id}`;
    assert.equal(coverage.count, 5000); assert.equal(coverage.distinct_count, 5000);
    check('Ten bounded reviewed applications recover 1000 batches with no duplicate sources and preserve the three-turn tail');
    assert.equal((await backfillStoryMemoryHistory(client, scope, review.reviewHash)).createdJobs, 0);
    await assert.rejects(backfillStoryMemoryHistory(client, scope, first.reviewHash), /REVIEW_STALE/);
    check('Changing the apply limit or reusing an old large-history review cannot overrun or duplicate recovery');
  } finally { await client`DELETE FROM chats WHERE id = ${chat.id}`; }
}
