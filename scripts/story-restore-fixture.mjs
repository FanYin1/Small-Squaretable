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
const { prepareStoryTurn, commitStoryTurn, getStoryState, addStoryNote } = await import('../src/server/services/story-state.service.ts');
const { loadStoryContent } = await import('../src/server/services/story-content.service.ts');
const { captureStoryContent } = await import('../src/server/services/story-content.service.ts');
const { collectStorySources } = await import('../src/server/services/story-diagnostics.service.ts');
const { buildStoryEntryProfile } = await import('../src/server/services/story-entry.service.ts');
const { loadStoryWorldbookEntries } = await import('../src/server/services/story-worldbooks.service.ts');
const { MemoryRepository } = await import('../src/db/repositories/memory.repository.ts');
const { storyExamples } = await import('../src/types/story-examples.ts');
const database = drizzle(sql, { schema });
const creation = new ChatCreationService(database);
const { StoryCorrectionsService } = await import('../src/server/services/story-corrections.service.ts');
const corrections = new StoryCorrectionsService(database);
const memories = new MemoryRepository(database);
const embedding = Array.from({ length: 384 }, (_, index) => index === 0 ? 1 : 0);
const marker = '恢复演练：已取得通行凭证，约定在灯塔见面。';
const snapshot = value => JSON.parse(JSON.stringify(value));

async function action(chat, actionId, response, interrupted = false) {
  const view = await getStoryState(chat.id, chat.userId, database);
  const selected = view.actions.find(item => item.id === actionId);
  assert.ok(selected, `Fixture action unavailable: ${actionId}`);
  const prepared = await prepareStoryTurn(chat, selected.label, { actionId, expectedVersion: view.version }, database);
  const [input] = await database.insert(schema.messages).values({ chatId: chat.id, role: 'user', content: selected.label }).returning();
  const requestId = randomUUID();
  const message = await commitStoryTurn(prepared, input.id, requestId, response, interrupted, database);
  return { prepared, inputId: input.id, requestId, messageId: message.id, response };
}

async function remember(chat, messageId, content) {
  const memory = await memories.create({ characterId: chat.characterId, userId: chat.userId, sourceChatId: chat.id, sourceMessageId: messageId, type: 'event', content, importance: '0.90' });
  await memories.createVector({ memoryId: memory.id, embedding });
  return memory.id;
}

try {
  if (process.argv[2] === 'seed') {
    assert.equal((await sql`SELECT count(*)::int AS count FROM users`)[0].count, 0, 'Seed only an empty disposable database');
    const [tenant] = await database.insert(schema.tenants).values({ name: 'Synthetic restore fixture' }).returning();
    const [user] = await database.insert(schema.users).values({ tenantId: tenant.id, email: `${randomUUID()}@example.test`, displayName: '恢复验收账户' }).returning();
    const [outsider] = await database.insert(schema.users).values({ tenantId: tenant.id, email: `${randomUUID()}@example.test`, displayName: '隔离验收账户' }).returning();
    const [persona] = await database.insert(schema.userPersonas).values({ tenantId: tenant.id, userId: user.id, name: '远行者', description: '习惯核对事实。' }).returning();
    const [character] = await database.insert(schema.characters).values({ tenantId: tenant.id, creatorId: user.id, name: '恢复验收卡', cardData: storyExamples[0].cardData }).returning();
    const [book] = await database.insert(schema.worldbooks).values({ tenantId: tenant.id, userId: user.id, characterId: character.id, name: '灯塔资料', scope: 'character' }).returning();
    const [entry] = await database.insert(schema.worldbookEntries).values({ worldbookId: book.id, keyword: '灯塔', content: '灯塔只承认已签发的通行凭证。', settings: { constant: true } }).returning();
    const createInput = () => ({ characterId: character.id, personaId: persona.id, clientRequestId: randomUUID() });
    const openingSources = await collectStorySources(database, [character.id]);
    const entryProfile = buildStoryEntryProfile(captureStoryContent([character.id], user.id, openingSources), openingSources);
    const main = (await creation.create(user.id, tenant.id, { ...createInput(), opening: { characterId: character.id,
      revision: entryProfile.revision, reference: { source: 'first_mes', index: 0 }, reviewed: true } })).chat;
    const other = (await creation.create(user.id, tenant.id, createInput())).chat;
    const deletedInput = createInput();
    const deleted = (await creation.create(user.id, tenant.id, deletedInput)).chat;
    const purchase = await action(main, 'permit', marker);
    await action(main, 'go-lighthouse', '脚步刚迈出，叙事在此停止。', true);
    await addStoryNote(main.id, user.id, { kind: 'style', content: '克制对白，记住灯塔会面的约定。' }, database);
    const memoryId = await remember(main, purchase.messageId, marker);
    const otherReply = await action(other, 'inspect', '另一个故事仅查看了蜡印。');
    const otherMemoryId = await remember(other, otherReply.messageId, '另一个故事的独立线索。');
    const branchInput = { requestId: randomUUID(), throughVersion: 1, mode: 'choice', direction: '留在港口核对凭证，不前往灯塔。', evidenceIds: [] };
    const branchPreview = await corrections.preview(main.id, user.id, tenant.id, branchInput);
    const branch = (await corrections.fork(main.id, user.id, tenant.id, branchInput, branchPreview.digest)).chat;
    const reading = await corrections.saveReading(branch.id, user.id, tenant.id, { requestId: randomUUID(), messageId:
      Number((await sql`SELECT id FROM messages WHERE chat_id=${branch.id} ORDER BY id DESC LIMIT 1`)[0].id),
      kind: 'annotation', content: '只作阅读标注，不修改灯塔约定。' });
    const deletedReply = await action(deleted, 'inspect', '这条故事将在备份前被删除。');
    await addStoryNote(deleted.id, user.id, { kind: 'note', content: '随故事删除的笔记。' }, database);
    await remember(deleted, deletedReply.messageId, '不应恢复的已删除记忆。');
    await database.delete(schema.chats).where(eq(schema.chats.id, deleted.id));
    await database.update(schema.userPersonas).set({ description: '来源身份已经修改。' }).where(eq(schema.userPersonas.id, persona.id));
    await database.update(schema.worldbookEntries).set({ content: '来源世界书已经修改。' }).where(eq(schema.worldbookEntries.id, entry.id));
    const view = await getStoryState(main.id, user.id, database);
    assert.equal(view.version, 2);
    assert.equal(view.map.location, 'harbor');
    assert.equal(view.fields.find(field => field.id === 'coins').value, 100);
    assert.equal(view.events[0].status, 'interrupted');
    await writeFile(process.env.STORY_RESTORE_FIXTURE, JSON.stringify({ branchId: branch.id, readingId: reading.id, mainId: main.id, otherId: other.id, deletedId: deleted.id, deletedInput, userId: user.id, outsiderId: outsider.id, tenantId: tenant.id, characterId: character.id, memoryId, otherMemoryId, purchase, view, otherView: await getStoryState(other.id, user.id, database) }), { mode: 0o600 });
    console.info('Seeded two surviving stories with confirmed/interrupted events, source-linked synthetic memories and vectors; deleted a third before backup.');
  } else {
    assert.equal(process.argv[2], 'verify');
    assert.ok(process.env.STORY_RESTORE_BEHAVIOR);
    const fixture = JSON.parse(await readFile(process.env.STORY_RESTORE_FIXTURE, 'utf8'));
    const checks = [];
    const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
    const restoredReading = await corrections.readings(fixture.branchId, fixture.userId, fixture.tenantId);
    check('Nonempty branch and reading revision restore with independent prefix state', restoredReading[0]?.id === fixture.readingId
      && (await getStoryState(fixture.branchId, fixture.userId, database)).version === 1);
    if (process.env.RITUAL_CARD_PATH && process.env.STORY_TRANSFER_FIXTURE) {
      const transferFixture = JSON.parse(await readFile(process.env.STORY_TRANSFER_FIXTURE, 'utf8'));
      const { verifyRitualTransfer } = await import('./story-ritual-transfer-check.mjs');
      await verifyRitualTransfer(database, transferFixture.ritual, fixture);
      checks.push('Whole-database restored original ritual preserves pending/interrupted counter, frozen artifact and duplicate receipt; continues 6→9 with independent 3→6 branch');
    }
    if (process.env.STORY_OPENING_RECORD_SAMPLE_PATH && process.env.STORY_TRANSFER_FIXTURE) {
      const transferFixture = JSON.parse(await readFile(process.env.STORY_TRANSFER_FIXTURE, 'utf8'));
      const initialView = await getStoryState(transferFixture.openingStoryId, fixture.userId, database);
      assert.deepEqual(initialView.openingRecord, transferFixture.openingRecord);
      assert.deepEqual(initialView.adaptationReport, transferFixture.adaptationReport);
      check('Frozen compatibility report survives full database restore', initialView.adaptationReport?.version === 1);
      check('Real-card initial record survives full restore independently of current balances', initialView.openingRecord.status === 'initial-only' && !initialView.native && initialView.fields.length === 0);
      const [initialChat] = await database.select().from(schema.chats).where(eq(schema.chats.id, transferFixture.openingStoryId));
      const initialTurn = await prepareStoryTurn(initialChat, '核对开局记录。', undefined, database);
      check('Restored model context retains historical starting values without authorizing spending', initialTurn.prompt.includes('historical starting values, NOT current resources') && initialTurn.rules === null);
    }
    const [chat] = await database.select().from(schema.chats).where(eq(schema.chats.id, fixture.mainId));
    assert.deepEqual(snapshot(await getStoryState(chat.id, fixture.userId, database)), fixture.view);
    check('Restored panel, available actions, event sources and style notes match the saved story', true);
    check('Identity remains frozen after its source changes', chat.identitySnapshot.description === '习惯核对事实。');
    const restoredContent = await loadStoryContent(chat.id, fixture.userId, database);
    const [restoredOpening] = await sql`SELECT role,content FROM messages WHERE chat_id=${chat.id} ORDER BY id LIMIT 1`;
    check('Selected opening reference and original assistant opening survive whole-database restore', restoredContent.characters[0].opening.reference.source === 'first_mes' && restoredOpening.role === 'assistant' && restoredOpening.content.length > 0);
    check('Character content snapshot remains readable', (await loadStoryContent(chat.id, fixture.userId, database)).characters[0].id === fixture.characterId);
    check('Bound worldbook uses the frozen entry after its source changes', (await loadStoryWorldbookEntries(chat.id, fixture.userId, fixture.characterId, database))[0].content === '灯塔只承认已签发的通行凭证。');
    const retrieved = await memories.hybridSearch({ characterId: fixture.characterId, userId: fixture.userId, chatId: chat.id, embedding });
    check('Real pgvector retrieval recovers only this story memory', retrieved.length === 1 && retrieved[0].id === fixture.memoryId);
    const otherRetrieved = await memories.findSimilar(fixture.characterId, fixture.userId, embedding, 0.9, 10, fixture.otherId);
    check('Another story with the same query vector stays isolated', otherRetrieved.length === 1 && otherRetrieved[0].id === fixture.otherMemoryId);
    const [source] = await sql`SELECT memory.id FROM character_memories memory JOIN messages message ON message.id = memory.source_message_id AND message.chat_id = memory.source_chat_id WHERE memory.id = ${fixture.memoryId} AND message.content = ${marker}`;
    check('Retrieved memory still links to its original confirmed text', Boolean(source));
    await assert.rejects(() => getStoryState(chat.id, fixture.outsiderId, database));
    check('Restored story still rejects a different owner', true);
    const replay = await commitStoryTurn(fixture.purchase.prepared, fixture.purchase.inputId, fixture.purchase.requestId, fixture.purchase.response, false, database);
    check('A pre-backup committed action replays without a second event', replay.id === fixture.purchase.messageId && (await getStoryState(chat.id, fixture.userId, database)).version === 2);
    const prompt = await prepareStoryTurn(chat, '继续核对约定。', undefined, database);
    check('Resumed generation preparation includes confirmed state and saved style notes', prompt.prompt.includes('灯塔会面') && prompt.values.coins === 100 && prompt.values.location === 'harbor');
    const [previousId] = await sql`SELECT max(id)::int AS id FROM messages`;
    const continued = await action(chat, 'go-lighthouse', '凭证核验完成，你抵达了灯塔。');
    const continuedView = await getStoryState(chat.id, fixture.userId, database);
    check('A new action after restore advances once and preserves resources', continuedView.version === 3 && continuedView.map.location === 'lighthouse' && continuedView.fields.find(field => field.id === 'coins').value === 100);
    check('Restored message sequence allocates fresh source IDs', continued.inputId > previousId.id && continued.messageId > continued.inputId);
    assert.deepEqual(snapshot(await getStoryState(fixture.otherId, fixture.userId, database)), fixture.otherView);
    check('Continuing the restored story does not alter another save', true);
    check('A story deleted before backup stays deleted after restore', (await creation.lookup(fixture.userId, fixture.tenantId, fixture.deletedInput.clientRequestId)).status === 'deleted');
    await assert.rejects(() => creation.create(fixture.userId, fixture.tenantId, fixture.deletedInput), error => error.code === 'CREATED_CHAT_DELETED');
    check('Replaying the deleted creation request cannot recreate its story', true);
    const pending = await prepareStoryTurn(chat, '回到雾港码头', undefined, database);
    await database.delete(schema.chats).where(eq(schema.chats.id, chat.id));
    const [leftovers] = await sql`SELECT
      (SELECT count(*)::int FROM messages WHERE chat_id = ${chat.id}) AS messages,
      (SELECT count(*)::int FROM story_events WHERE chat_id = ${chat.id}) AS events,
      (SELECT count(*)::int FROM story_states WHERE chat_id = ${chat.id}) AS state,
      (SELECT count(*)::int FROM story_notes WHERE chat_id = ${chat.id}) AS notes,
      (SELECT count(*)::int FROM story_content WHERE chat_id = ${chat.id}) AS content,
      (SELECT count(*)::int FROM story_worldbooks WHERE chat_id = ${chat.id}) AS worldbooks,
      (SELECT count(*)::int FROM character_memories WHERE source_chat_id = ${chat.id}) AS memories,
      (SELECT count(*)::int FROM character_memory_vectors WHERE memory_id = ${fixture.memoryId}) AS vectors`;
    check('Deleting a restored story cascades its messages, snapshots, state, notes, events, memories and vectors', Object.values(leftovers).every(count => count === 0));
    check('Deleted story memory is absent from scoped and global retrieval', (await memories.hybridSearch({ characterId: fixture.characterId, userId: fixture.userId, chatId: chat.id, embedding })).length === 0 && (await memories.findByCharacterAndUser(fixture.characterId, fixture.userId, 100, null)).length === 0);
    await assert.rejects(() => memories.create({ characterId: fixture.characterId, userId: fixture.userId, sourceChatId: chat.id, sourceMessageId: continued.messageId, type: 'event', content: '延迟派生不应恢复故事' }), error => (error.cause?.code ?? error.code) === '23503');
    await assert.rejects(() => commitStoryTurn(pending, continued.inputId, randomUUID(), '延迟生成不应恢复故事', false, database), error => error.code === 'STORY_STATE_UNAVAILABLE');
    check('Late memory insertion and late turn commit cannot resurrect the deleted story', true);
    assert.deepEqual(snapshot(await getStoryState(fixture.otherId, fixture.userId, database)), fixture.otherView);
    check('Deletion and rejected late writes leave the other save intact', true);
    await writeFile(process.env.STORY_RESTORE_BEHAVIOR, JSON.stringify({ checks, continuation: { version: continuedView.version, coins: 100, location: continuedView.map.location }, deletion: leftovers }, null, 2), { mode: 0o600 });
    console.info(`${checks.length} restored-story behavior checks passed`);
  }
} finally {
  await sql.end();
}
