import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema/index.ts';
import { ChatCreationService } from '../src/server/services/chat-creation.service.ts';
import { prepareStoryTurn, commitStoryTurn } from '../src/server/services/story-state.service.ts';
import { StoryMemoryWorker } from '../src/server/services/story-memory-worker.service.ts';

export async function checkStoryDeletionRaces({ database, raw, userId, tenantId, characterId, check }) {
  const creation = new ChatCreationService(database);
  const makeChat = async () => (await creation.create(userId, tenantId, { characterId, clientRequestId: randomUUID() })).chat;
  let deadlocks = 0;
  const observed = new Proxy(database, { get(target, property) {
    if (property === 'transaction') return (...args) => target.transaction(...args).catch(error => {
      if (error.code === '40P01' || error.cause?.code === '40P01') deadlocks++;
      throw error;
    });
    const value = Reflect.get(target, property);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  async function waitForLock(pattern) {
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      const [row] = await raw`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database()
        AND pid <> pg_backend_pid() AND wait_event_type='Lock' AND query LIKE ${pattern}`;
      if (row.count > 0) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Expected lock wait did not occur: ${pattern}`);
  }
  const chat = await makeChat();
  const turn = await prepareStoryTurn(chat, '观察周围', undefined, database);
  const [input] = await database.insert(schema.messages).values({ chatId: chat.id, role: 'user', content: '观察周围' }).returning();
  let completion, deletion;
  await raw.begin(async transaction => {
    await transaction`SELECT chat_id FROM story_states WHERE chat_id=${chat.id} FOR UPDATE`;
    completion = commitStoryTurn(turn, input.id, randomUUID(), '周围安静。', false, observed).then(value => ({ value }), error => ({ error }));
    await waitForLock('%story_states%');
    deletion = database.delete(schema.chats).where(eq(schema.chats.id, chat.id)).then(value => ({ value }), error => ({ error }));
    await waitForLock('%delete from "chats"%');
  });
  const results = await Promise.all([completion, deletion]);
  assert.equal(deadlocks, 0, 'Generation commit and deletion used conflicting lock order');
  assert.ok(results.every(result => !result.error), `Concurrent generation/delete should serialize: ${JSON.stringify(results.map(result => result.error ? { code: result.error.code, cause: result.error.cause?.code } : 'ok'))}`);
  assert.equal((await raw`SELECT count(*)::int AS count FROM messages WHERE chat_id=${chat.id}`)[0].count, 0);
  check('Generation commit versus deletion serializes with parent-first locking; no deadlock or resurrected response');

  function gate() {
    let release, enter;
    const entered = new Promise(resolve => { enter = resolve; });
    const stopped = new Promise(resolve => { release = resolve; });
    return { entered, release, wait: async () => { enter(); await stopped; } };
  }
  async function jobChat() {
    const story = await makeChat();
    for (let index = 0; index < 5; index++) {
      const prepared = await prepareStoryTurn(story, '记住这个约定。', undefined, database);
      const [source] = await database.insert(schema.messages).values({ chatId: story.id, role: 'user', content: '记住这个约定。' }).returning();
      await commitStoryTurn(prepared, source.id, randomUUID(), '约定在灯塔见面。', false, database);
    }
    return story;
  }
  const settings = { maxAttempts: 3, timeoutMs: 15000, maxInputChars: 24000, memoryLimit: 100 };
  const providers = {
    extract: async sources => ({ version: 1, facts: [{ type: 'event', content: '约定在灯塔见面。', sourceMessageIds: [sources[0].messageId] }],
      summary: { content: '会面尚未发生。', sourceMessageIds: [sources[0].messageId] } }),
    embed: async texts => texts.map(() => Array.from({ length: 384 }, (_, index) => index === 0 ? 1 : 0)),
  };
  for (const stage of ['extract', 'embed']) {
    const story = await jobChat();
    const pause = gate();
    const running = new StoryMemoryWorker(observed, { ...providers, [stage]: async (...args) => {
      await pause.wait(); return providers[stage](...args);
    } }, settings).runOnce();
    await pause.entered;
    await database.delete(schema.chats).where(eq(schema.chats.id, story.id));
    pause.release();
    assert.equal(await running, 'superseded');
    assert.equal((await raw`SELECT count(*)::int AS count FROM character_memories WHERE source_chat_id=${story.id}`)[0].count, 0);
    assert.equal((await raw`SELECT count(*)::int AS count FROM story_memory_jobs WHERE chat_id=${story.id}`)[0].count, 0);
    check(`Deletion during ${stage} rejects late derived memory and removes pending work`);
  }
  const story = await jobChat();
  const pause = gate();
  const running = new StoryMemoryWorker(observed, { ...providers, embed: async texts => { await pause.wait(); return providers.embed(texts); } }, settings).runOnce();
  await pause.entered;
  await raw.begin(async transaction => {
    await transaction`SELECT id FROM story_memory_jobs WHERE chat_id=${story.id} FOR UPDATE`;
    pause.release();
    await waitForLock('%story_memory_jobs%');
    deletion = database.delete(schema.chats).where(eq(schema.chats.id, story.id)).then(value => ({ value }), error => ({ error }));
    await waitForLock('%delete from "chats"%');
  });
  assert.ok(['succeeded', 'superseded'].includes(await running));
  assert.ok(!(await deletion).error);
  assert.equal(deadlocks, 0, 'Memory commit and deletion used conflicting lock order');
  assert.equal((await raw`SELECT count(*)::int AS count FROM character_memories WHERE source_chat_id=${story.id}`)[0].count, 0);
  assert.equal((await raw`SELECT count(*)::int AS count FROM story_memory_jobs WHERE chat_id=${story.id}`)[0].count, 0);
  check('Deletion at memory commit serializes without deadlock and cascades checkpoint, vectors and provenance');
}
