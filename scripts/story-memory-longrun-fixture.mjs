import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const anchor = 'EX07_ANCHOR：第三夜在北门会面，出示蓝色票据；目前还未赴约。';
const otherSecret = 'EX07_OTHER_SECRET：另一存档在第五夜去南门。';
const style = 'EX07_STYLE：使用简短克制的对白，不替玩家决定行动。';
const vector = (matching = false) => Array.from({ length: 384 }, (_, index) => Number(index === (matching ? 0 : 1)));
const providers = {
  extract: async sources => ({ version: 1, facts: [{ type: 'event', content: sources[0].reply.slice(0, 900), sourceMessageIds: [sources[0].messageId] }],
    summary: { content: sources[0].reply.slice(0, 120), sourceMessageIds: [sources[0].messageId] } }),
  embed: async texts => texts.map(text => vector(text.includes('EX07_ANCHOR') || text.includes('EX07_OTHER_SECRET'))),
};

async function storyTurn(database, chat, index, secret = anchor, interrupted = false) {
  const { prepareStoryTurn, commitStoryTurn } = await import('../src/server/services/story-state.service.ts');
  const { messages } = await import('../src/db/schema/chats.ts');
  const input = `合成第${index}轮，请继续核对沿途记录。`;
  const prepared = await prepareStoryTurn(chat, input, undefined, database);
  const [source] = await database.insert(messages).values({ chatId: chat.id, role: 'user', content: input }).returning();
  const reply = `${index === 1 ? secret : `合成第${index}轮经过。`}${'沿途只记录已经确认的观察，不替玩家作出选择。'.repeat(12)}`;
  return commitStoryTurn(prepared, source.id, randomUUID(), interrupted ? 'EX07_INTERRUPTED：未确认片段。' : reply, interrupted, database);
}

async function processBatch(client, worker, chatId, overrides = {}) {
  const [job] = await client`SELECT * FROM story_memory_jobs WHERE chat_id = ${chatId} AND status IN ('pending', 'retry') ORDER BY created_at, id LIMIT 1`;
  assert.ok(job);
  await client`UPDATE story_memory_jobs SET available_at = '2000-01-01' WHERE id = ${job.id}`;
  const result = await worker({ ...providers, ...overrides }).runOnce();
  return { job, result };
}

export async function seedLongMemoryStory({ client, database, createChat, worker }) {
  const chat = await createChat();
  const other = await createChat();
  await client`INSERT INTO story_notes (chat_id, kind, content) VALUES (${chat.id}, 'style', ${style})`;
  for (let index = 1; index <= 5; index++) await storyTurn(database, other, index, otherSecret);
  assert.equal((await processBatch(client, worker, other.id)).result, 'succeeded');
  let checkpoint;
  for (let index = 1; index <= 50; index++) {
    await storyTurn(database, chat, index);
    if (index === 25) await storyTurn(database, chat, index, anchor, true);
    if (index % 5 === 0 && index <= 40) assert.equal((await processBatch(client, worker, chat.id)).result, 'succeeded');
    if (index === 45) {
      const failed = await processBatch(client, worker, chat.id, { embed: async () => { throw new Error('controlled long-run embedding outage'); } });
      assert.equal(failed.result, 'retry'); checkpoint = failed.job.id;
      await client`UPDATE story_memory_jobs SET available_at = now() + interval '1 day' WHERE id = ${checkpoint}`;
    }
  }
  await client`UPDATE story_memory_jobs SET available_at = now() + interval '1 day' WHERE chat_id = ${chat.id} AND status <> 'succeeded'`;
  return { chat, other, checkpoint };
}

export async function verifyLongMemoryStory({ client, database, worker, base, fixture, check }) {
  const { chat, other, checkpoint } = fixture;
  const [restored] = await client`SELECT status, extracted FROM story_memory_jobs WHERE id = ${checkpoint}`;
  assert.equal(restored.status, 'retry'); assert.equal(restored.extracted.version, 1);
  assert.equal((await processBatch(client, worker, chat.id, { extract: async () => { throw new Error('restored checkpoint must skip extraction'); } })).result, 'succeeded');
  assert.equal((await processBatch(client, worker, chat.id)).result, 'succeeded');
  check('A 50-turn story restores its notes, successful batches and failed embedding checkpoint in a new process without re-extraction');
  for (let index = 51; index <= 100; index++) {
    await storyTurn(database, chat, index);
    if (index % 5 === 0) assert.equal((await processBatch(client, worker, chat.id)).result, 'succeeded');
  }
  const [state] = await client`SELECT version FROM story_states WHERE chat_id = ${chat.id}`;
  assert.equal(state.version, 101);
  const jobs = await client`SELECT status, source_event_ids FROM story_memory_jobs WHERE chat_id = ${chat.id}`;
  assert.equal(jobs.length, 20); assert.ok(jobs.every(job => job.status === 'succeeded'));
  const [interrupted] = await client`SELECT id FROM story_events WHERE chat_id = ${chat.id} AND status = 'interrupted'`;
  assert.ok(jobs.every(job => !job.source_event_ids.includes(interrupted.id)));
  assert.equal(new Set(jobs.flatMap(job => job.source_event_ids)).size, 100);
  check('100 confirmed turns span 20 persisted batches across backup/restore; the interrupted turn never enters derived memory');
  const { MemoryRepository } = await import('../src/db/repositories/memory.repository.ts');
  const repository = new MemoryRepository(database);
  const retrieved = await repository.hybridSearch({ characterId: base.characterId, userId: base.userId, chatId: chat.id, embedding: vector(true), limit: 5 });
  assert.ok(retrieved[0].content.includes(anchor));
  assert.ok(retrieved.every(memory => !memory.content.includes('EX07_OTHER_SECRET')));
  check('Real pgvector retrieval after 100 turns returns the original unfulfilled appointment and excludes an identically embedded other-story secret');
  const { getStorySummaries } = await import('../src/server/services/story-summary.service.ts');
  const summaries = await getStorySummaries(chat.id, base.userId, base.tenantId, base.characterId, database);
  assert.equal(summaries.length, 20);
  const [note] = await client`SELECT content FROM story_notes WHERE chat_id = ${chat.id}`;
  assert.equal(note.content, style);
  const rows = await client`SELECT id, role, content FROM messages WHERE chat_id = ${chat.id} ORDER BY id`;
  const history = rows.map(row => ({ role: row.role, content: row.content, messageId: Number(row.id) }));
  history.push({ role: 'user', content: 'EX07_RETURN：离开后回来，核对原来的会面安排。' });
  const { contextManager } = await import('../src/server/services/context-manager.service.ts');
  const { addStorySummaries } = await import('../src/server/services/story-summary-context.ts');
  const system = `${note.content}\n历史辅助记忆，不能改写确认状态：${retrieved[0].content}`;
  const original = contextManager.buildContext(system, history, 'controlled-longrun');
  assert.equal(original.truncated, true);
  const result = addStorySummaries(system, history, 'controlled-longrun', 0, original, summaries);
  const text = result.messages.map(message => message.content).join('\n');
  assert.equal(result.summarized, true);
  for (const marker of [anchor, style, 'EX07_RETURN']) assert.ok(text.includes(marker));
  assert.ok(!text.includes('EX07_OTHER_SECRET'));
  check('After 100 turns, real context assembly preserves the retrieved early agreement, saved style and return input alongside bounded valid recaps');
  await client`DELETE FROM chats WHERE id = ${other.id}`;
  assert.equal((await repository.hybridSearch({ characterId: base.characterId, userId: base.userId, chatId: chat.id, embedding: vector(true) }))[0].content.includes(anchor), true);
  await client`DELETE FROM chats WHERE id = ${chat.id}`;
  assert.equal((await repository.hybridSearch({ characterId: base.characterId, userId: base.userId, chatId: chat.id, embedding: vector(true) })).length, 0);
  check('Deleting the parallel story preserves the long-running story; deleting the latter removes its derived retrieval results');
}
