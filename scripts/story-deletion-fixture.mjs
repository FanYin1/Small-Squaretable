import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';

const databaseUrl = new URL(process.env.DATABASE_URL || 'http://missing');
assert.equal(databaseUrl.hostname, '127.0.0.1');
assert.equal(databaseUrl.pathname, '/squaretable_story_restore_test');
assert.equal(databaseUrl.username, 'restore_check');
assert.ok(process.env.STORY_RESTORE_FIXTURE);
const sql = postgres(databaseUrl.toString(), { max: 2 });
const schema = await import('../src/db/schema/index.ts');
const { ChatCreationService } = await import('../src/server/services/chat-creation.service.ts');
const { ChatRepository } = await import('../src/db/repositories/chat.repository.ts');
const { MemoryRepository } = await import('../src/db/repositories/memory.repository.ts');
const { getStoryState, commitStoryTurn } = await import('../src/server/services/story-state.service.ts');
const { exportStoryReading } = await import('../src/server/services/story-export.service.ts');
const database = drizzle(sql, { schema });
const creation = new ChatCreationService(database);
const chats = new ChatRepository(database);
const memories = new MemoryRepository(database);
const fixture = JSON.parse(await readFile(process.env.STORY_RESTORE_FIXTURE, 'utf8'));
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };

try {
  if (process.argv[2] === 'after-backup') {
    const [originalRequest] = await sql`SELECT request_id FROM chat_creation_requests WHERE chat_id = ${fixture.mainId}`;
    check('A mismatched tenant cannot delete the story or generate a receipt', !await chats.delete(fixture.mainId, randomUUID()) && (await sql`SELECT chat_id FROM story_deletions WHERE chat_id = ${fixture.mainId}`).length === 0);
    const rollback = new Error('Expected deletion rollback');
    await assert.rejects(sql.begin(async transaction => {
      await transaction`DELETE FROM chats WHERE id = ${fixture.mainId}`;
      assert.equal((await transaction`SELECT chat_id FROM story_deletions WHERE chat_id = ${fixture.mainId}`).length, 1);
      throw rollback;
    }), error => error === rollback);
    check('Rolled-back deletion leaves no receipt and preserves the story and memory', Boolean(await chats.findById(fixture.mainId)) && (await sql`SELECT id FROM character_memories WHERE id = ${fixture.memoryId}`).length === 1 && (await sql`SELECT chat_id FROM story_deletions WHERE chat_id = ${fixture.mainId}`).length === 0);
    assert.ok(await chats.delete(fixture.mainId, fixture.tenantId));
    const [receipt] = await sql`SELECT * FROM story_deletions WHERE chat_id = ${fixture.mainId}`;
    check('Normal repository deletion atomically captures owner and creation request without story text', receipt.user_id === fixture.userId && receipt.tenant_id === fixture.tenantId && receipt.creation_requests.length === 1 && receipt.creation_requests[0].requestId === originalRequest.request_id && !JSON.stringify(receipt).includes('灯塔'));
    const laterInput = { characterId: fixture.characterId, clientRequestId: randomUUID() };
    const later = (await creation.create(fixture.userId, fixture.tenantId, laterInput)).chat;
    await chats.delete(later.id, fixture.tenantId);
    check('A story created and deleted after the backup retains its creation replay evidence', (await sql`SELECT creation_requests FROM story_deletions WHERE chat_id = ${later.id}`)[0].creation_requests[0].requestId === laterInput.clientRequestId);
    await assert.rejects(() => sql`INSERT INTO chats (id, tenant_id, user_id) VALUES (${fixture.mainId}, ${fixture.tenantId}, ${fixture.userId})`, error => error.code === '23505');
    check('Deleted story IDs cannot be reused by a late insert', !await chats.findById(fixture.mainId));
    const [concurrentChat] = await database.insert(schema.chats).values({ tenantId: fixture.tenantId, userId: fixture.userId }).returning();
    await assert.rejects(sql.begin('isolation level repeatable read', async transaction => {
      await transaction`SELECT id FROM chats WHERE id = ${concurrentChat.id}`;
      await chats.delete(concurrentChat.id, fixture.tenantId);
      await transaction`INSERT INTO chats (id, tenant_id, user_id) VALUES (${concurrentChat.id}, ${fixture.tenantId}, ${fixture.userId})`;
    }), error => error.code === '23505');
    check('A transaction with an older snapshot cannot reinsert an ID deleted after that snapshot', !await chats.findById(concurrentChat.id));
    await assert.rejects(() => sql`UPDATE story_deletions SET deleted_at = now() WHERE chat_id = ${fixture.mainId}`, error => error.code === '23514');
    await assert.rejects(() => sql`DELETE FROM story_deletions WHERE chat_id = ${fixture.mainId}`, error => error.code === '23514');
    await assert.rejects(() => sql`TRUNCATE story_deletions`, error => error.code === '23514');
    await assert.rejects(() => sql`TRUNCATE chats CASCADE`, error => error.code === '23514');
    await assert.rejects(() => sql`DELETE FROM story_id_reservations WHERE chat_id = ${fixture.mainId}`, error => error.code === '23514');
    await assert.rejects(() => sql`UPDATE story_restore_lineage SET id = ${randomUUID()}`, error => error.code === '23514');
    check('Receipts, reserved IDs and restore lineage reject ordinary alteration or removal', true);
    const [temporaryUser] = await database.insert(schema.users).values({ tenantId: fixture.tenantId, email: `${randomUUID()}@example.test`, displayName: '删除级联验收' }).returning();
    const [temporaryChat] = await database.insert(schema.chats).values({ tenantId: fixture.tenantId, userId: temporaryUser.id }).returning();
    await database.delete(schema.users).where(eq(schema.users.id, temporaryUser.id));
    check('A cascaded account deletion preserves its story receipt after the owner disappears', (await sql`SELECT chat_id FROM story_deletions WHERE chat_id = ${temporaryChat.id}`).length === 1);
    fixture.deletion = { checks, originalRequestId: originalRequest.request_id, laterInput, laterId: later.id };
    await writeFile(process.env.STORY_RESTORE_FIXTURE, JSON.stringify(fixture), { mode: 0o600 });
  } else {
    assert.equal(process.argv[2], 'verify');
    assert.ok(process.env.STORY_RESTORE_BEHAVIOR);
    checks.push(...fixture.deletion.checks);
    check('Restored old backup no longer contains stories deleted after it was taken', !await chats.findById(fixture.mainId) && !await chats.findById(fixture.deletion.laterId));
    const [leftovers] = await sql`SELECT
      (SELECT count(*)::int FROM messages WHERE chat_id = ${fixture.mainId}) AS messages,
      (SELECT count(*)::int FROM story_events WHERE chat_id = ${fixture.mainId}) AS events,
      (SELECT count(*)::int FROM story_states WHERE chat_id = ${fixture.mainId}) AS state,
      (SELECT count(*)::int FROM story_notes WHERE chat_id = ${fixture.mainId}) AS notes,
      (SELECT count(*)::int FROM story_content WHERE chat_id = ${fixture.mainId}) AS content,
      (SELECT count(*)::int FROM story_worldbooks WHERE chat_id = ${fixture.mainId}) AS worldbooks,
      (SELECT count(*)::int FROM character_memories WHERE source_chat_id = ${fixture.mainId}) AS memories,
      (SELECT count(*)::int FROM character_memory_vectors WHERE memory_id = ${fixture.memoryId}) AS vectors`;
    check('Replayed deletion cascades all restored text, state, sources, notes, memory and vectors', Object.values(leftovers).every(count => count === 0));
    check('Original and post-backup creation requests both report deleted', (await creation.lookup(fixture.userId, fixture.tenantId, fixture.deletion.originalRequestId)).status === 'deleted' && (await creation.lookup(fixture.userId, fixture.tenantId, fixture.deletion.laterInput.clientRequestId)).status === 'deleted');
    await assert.rejects(() => creation.create(fixture.userId, fixture.tenantId, fixture.deletion.laterInput), error => error.code === 'CREATED_CHAT_DELETED');
    check('Replaying a creation request absent from the old backup cannot recreate its deleted story', true);
    await assert.rejects(() => sql`INSERT INTO chats (id, tenant_id, user_id) VALUES (${fixture.deletion.laterId}, ${fixture.tenantId}, ${fixture.userId})`, error => error.code === '23505');
    check('Post-backup story IDs remain reserved after restoration', true);
    await assert.rejects(() => exportStoryReading(fixture.mainId, fixture.userId, fixture.tenantId, database), error => error.code === 'NOT_FOUND');
    await assert.rejects(() => commitStoryTurn(fixture.purchase.prepared, fixture.purchase.inputId, randomUUID(), '迟到的剧情', false, database), error => error.code === 'STORY_STATE_UNAVAILABLE');
    await assert.rejects(() => memories.create({ characterId: fixture.characterId, userId: fixture.userId, sourceChatId: fixture.mainId, sourceMessageId: fixture.purchase.messageId, type: 'event', content: '迟到的记忆' }), error => (error.cause?.code ?? error.code) === '23503');
    check('Exports, late generation and late memory writes cannot restore the deleted content', true);
    const embedding = Array.from({ length: 384 }, (_, index) => index === 0 ? 1 : 0);
    check('Deleted memory is absent from vector retrieval after old-backup cleanup', (await memories.hybridSearch({ characterId: fixture.characterId, userId: fixture.userId, chatId: fixture.mainId, embedding })).length === 0);
    assert.deepEqual(JSON.parse(JSON.stringify(await getStoryState(fixture.otherId, fixture.userId, database))), fixture.otherView);
    check('Other stories and their source-backed memory survive replay unchanged', (await memories.hybridSearch({ characterId: fixture.characterId, userId: fixture.userId, chatId: fixture.otherId, embedding })).some(memory => memory.id === fixture.otherMemoryId));
    await writeFile(process.env.STORY_RESTORE_BEHAVIOR, JSON.stringify({ checks, deletion: leftovers }, null, 2), { mode: 0o600 });
  }
  console.info(`${checks.length} deletion lifecycle checks passed`);
} finally {
  await sql.end();
}
