import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { verifiedStoryMemoryOrigins } from '../src/server/services/story-knowledge.service.ts';
import { getStorySummaries } from '../src/server/services/story-summary.service.ts';
import { assertLegacyMemoryScope, deleteOwnedLegacyMemory } from '../src/server/services/legacy-memory-access.service.ts';
import { MemoryRepository } from '../src/db/repositories/memory.repository.ts';

export async function checkStoryMemoryContinuity({ client, database, base, createChat, batch, worker, check }) {
  const chat = await createChat();
  const other = await createChat();
  const repository = new MemoryRepository(database);
  const vector = Array.from({ length: 384 }, (_, index) => index === 0 ? 1 : 0);
  const facts = sources => ({ version: 1, facts: [
    { type: 'event', content: '约好明晚在灯塔见面，尚未赴约。', sourceMessageIds: [sources[0].messageId, sources[1].inputMessageId] },
    { type: 'preference', content: '玩家要求短句，少用比喻。', sourceMessageIds: [sources[1].inputMessageId] },
    { type: 'fact', content: '约好明晚在灯塔见面，尚未赴约。', sourceMessageIds: [sources[0].messageId] },
  ], summary: { content: '约定尚未完成；本次体验使用短句。', sourceMessageIds: [sources[0].messageId, sources[1].inputMessageId] } });
  const stored = () => client`SELECT * FROM character_memories WHERE source_chat_id = ${chat.id} ORDER BY type`;
  const origins = async () => verifiedStoryMemoryOrigins(chat.id, base.characterId, (await stored()).map(memory => memory.id), undefined, database);
  const summaries = () => getStorySummaries(chat.id, base.userId, base.tenantId, base.characterId, database);
  await batch(chat);
  assert.equal(await worker({ extract: async sources => facts(sources) }).runOnce(), 'succeeded');
  assert.equal((await stored()).length, 3);
  assert.equal((await origins()).size, 3);
  check('Same text in event and fact categories stays separate, with verified preference and agreement sources');

  await batch(chat);
  assert.equal(await worker({ extract: async sources => facts(sources) }).runOnce(), 'succeeded');
  assert.equal((await stored()).length, 3);
  const provenance = await origins();
  assert.equal(provenance.size, 3);
  const event = (await stored()).find(memory => memory.type === 'event');
  assert.deepEqual([provenance.get(event.id).firstVersion, provenance.get(event.id).lastVersion], [1, 7]);
  assert.equal(provenance.get(event.id).sourceMessageIds.length, 4);
  check('Cross-batch exact dedup retains every referenced message and both event versions');

  const [source] = await client`SELECT message.* FROM messages message JOIN story_memory_links link ON link.message_id = message.id
    WHERE link.memory_id = ${event.id} ORDER BY message.id LIMIT 1`;
  await client`UPDATE messages SET content = content || ' edited after extraction' WHERE id = ${source.id}`;
  assert.equal((await origins()).size, 0);
  assert.equal((await summaries()).length, 1);
  await client`UPDATE messages SET content = ${source.content} WHERE id = ${source.id}`;
  assert.equal((await origins()).size, 3);
  assert.equal((await summaries()).length, 2);
  check('Edited source invalidates affected merged facts and only its own recap; restored source permits revalidation');

  for (const patch of [{ stateStatus: 'proposed' }, { storyVersion: 999 }, { storyRequestId: randomUUID() }]) {
    await client`UPDATE messages SET extra = extra || ${JSON.stringify(patch)}::jsonb WHERE id = ${source.id}`;
    assert.equal((await origins()).size, 0);
    await client`UPDATE messages SET extra = ${JSON.stringify(source.extra)}::jsonb WHERE id = ${source.id}`;
  }
  check('State status, event version and generation request mismatch each exclude sourced memories');

  await client`UPDATE character_memories SET content = '未经来源支持的记忆' WHERE id = ${event.id}`;
  assert.equal((await origins()).has(event.id), false);
  await client`UPDATE character_memories SET content = ${event.content} WHERE id = ${event.id}`;
  await client`UPDATE character_memories SET source_message_id = 999999999 WHERE id = ${event.id}`;
  assert.equal((await origins()).has(event.id), false);
  await client`UPDATE character_memories SET source_message_id = ${event.source_message_id} WHERE id = ${event.id}`;
  const [link] = await client`DELETE FROM story_memory_links WHERE memory_id = ${event.id} AND message_id = ${source.id} RETURNING *`;
  assert.equal((await origins()).has(event.id), false);
  await client`INSERT INTO story_memory_links ${client(link)}`;
  assert.equal((await origins()).has(event.id), true);
  check('Changed derived text and incomplete citation links cannot masquerade as checkpoint-backed facts');

  assert.equal((await verifiedStoryMemoryOrigins(other.id, base.characterId, [event.id], undefined, database)).size, 0);
  assert.equal((await verifiedStoryMemoryOrigins(chat.id, randomUUID(), [event.id], undefined, database)).size, 0);
  await assert.rejects(getStorySummaries(chat.id, randomUUID(), base.tenantId, base.characterId, database), error => error.statusCode === 404);
  await assert.rejects(getStorySummaries(chat.id, base.userId, randomUUID(), base.characterId, database), error => error.statusCode === 404);
  check('Other save, character, account and tenant cannot reuse this story provenance or recaps');

  await assert.rejects(assertLegacyMemoryScope(base.characterId, base.userId, base.tenantId, chat.id, database), error => error.code === 'STORY_MEMORY_MANAGED');
  await assert.rejects(deleteOwnedLegacyMemory(event.id, base.characterId, base.userId, base.tenantId, database), error => error.statusCode === 404);
  const [legacy] = await client`INSERT INTO chats (tenant_id, user_id, character_id) VALUES (${base.tenantId}, ${base.userId}, ${base.characterId}) RETURNING id`;
  await assertLegacyMemoryScope(base.characterId, base.userId, base.tenantId, legacy.id, database);
  for (const [characterId, userId, tenantId] of [[randomUUID(), base.userId, base.tenantId],
    [base.characterId, randomUUID(), base.tenantId], [base.characterId, base.userId, randomUUID()]]) {
    await assert.rejects(assertLegacyMemoryScope(characterId, userId, tenantId, legacy.id, database), error => error.statusCode === 404);
  }
  check('Legacy extraction requires account, tenant and membership; new stories cannot bypass managed derivation or deletion');

  const global = await repository.create({ characterId: base.characterId, userId: base.userId, type: 'fact', content: randomUUID() });
  await repository.createVector({ memoryId: global.id, embedding: vector });
  await assert.rejects(deleteOwnedLegacyMemory(global.id, base.characterId, randomUUID(), base.tenantId, database), error => error.statusCode === 404);
  await assert.rejects(deleteOwnedLegacyMemory(global.id, randomUUID(), base.userId, base.tenantId, database), error => error.statusCode === 404);
  await assert.rejects(deleteOwnedLegacyMemory(global.id, base.characterId, base.userId, randomUUID(), database), error => error.statusCode === 404);
  assert.ok((await repository.hybridSearch({ characterId: base.characterId, userId: base.userId, embedding: vector, chatId: null })).every(memory => memory.source_chat_id == null));
  const beforeClear = await stored();
  await repository.deleteAllForCharacterUser(base.characterId, base.userId, null);
  assert.deepEqual(await stored(), beforeClear);
  const own = await repository.create({ characterId: base.characterId, userId: base.userId, type: 'fact', content: randomUUID() });
  await deleteOwnedLegacyMemory(own.id, base.characterId, base.userId, base.tenantId, database);
  assert.equal((await client`SELECT id FROM character_memories WHERE id = ${own.id}`).length, 0);
  check('Global-only retrieval/clear preserve story memories; foreign-ID deletion is denied and own legacy deletion works');

  await batch(chat);
  assert.equal(await worker({ extract: async sources => ({ version: 1,
    facts: [{ type: 'event', content: '后来双方明确改约后天；先前约定保留为历史。', sourceMessageIds: [sources[0].messageId] }],
    summary: { content: '新一批已调整会面日期。', sourceMessageIds: [sources[0].messageId] },
  }) }).runOnce(), 'succeeded');
  assert.equal((await stored()).length, 4);
  assert.equal((await origins()).size, 4);
  check('A later agreement adjustment adds a sourced event without overwriting the original agreement or style preference');
  await batch(chat);
  assert.equal(await worker({ extract: async sources => facts(sources) }, { memoryLimit: 2 }).runOnce(), 'succeeded');
  assert.equal((await stored()).length, 2);
  assert.equal((await repository.findStoryPreferences(base.characterId, base.userId, chat.id)).length, 1);
  assert.equal((await repository.findStoryPreferences(base.characterId, base.userId, other.id)).length, 0);
  assert.equal((await summaries()).length, 4);
  assert.equal((await client`SELECT count(*)::int AS count FROM messages WHERE chat_id = ${chat.id}`)[0].count, 40);
  check('Capacity cleanup removes derived rows only, preserving original turns and versioned recaps for return');
}
