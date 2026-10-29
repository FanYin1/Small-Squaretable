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
assert.ok(process.env.STORY_EXPORT_BEHAVIOR);
const fixture = JSON.parse(await readFile(process.env.STORY_RESTORE_FIXTURE, 'utf8'));
const sql = postgres(databaseUrl.toString(), { max: 2 });
const schema = await import('../src/db/schema/index.ts');
const { ChatCreationService } = await import('../src/server/services/chat-creation.service.ts');
const { prepareStoryTurn, commitStoryTurn, addStoryNote } = await import('../src/server/services/story-state.service.ts');
const { exportStoryReading, renderStoryReading } = await import('../src/server/services/story-export.service.ts');
const { storyExamples } = await import('../src/types/story-examples.ts');
const database = drizzle(sql, { schema });
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };

try {
  const secrets = ['PRIVATE_CARD_PROMPT', 'PRIVATE_WORLDBOOK', 'HIDDEN_FIELD_VALUE', 'HIDDEN_CHANGE_VALUE', 'UNDISCOVERED_FIELD', 'UNDISCOVERED_MAP', 'PRIVATE_DERIVED_MEMORY', 'SYSTEM_ONLY_TEXT', 'MESSAGE_EXTRA_SECRET'];
  const cardData = structuredClone(storyExamples[0].cardData);
  cardData.system_prompt = secrets[0];
  const rules = cardData.extensions.squaretable.exploration;
  rules.fields.push({ id: 'privateField', label: 'Hidden field', type: 'string', initial: secrets[2], visible: false });
  rules.fields.push({ id: 'undiscovered', label: 'Undiscovered field', type: 'string', initial: secrets[4], visibleWhen: [{ field: 'seal', operator: 'eq', value: true }] });
  rules.map.nodes.push({ id: 'hidden-room', label: secrets[5], links: [], visibleWhen: [{ field: 'seal', operator: 'eq', value: true }] });
  rules.actions.find(action => action.id === 'permit').changes.push({ field: 'privateField', operation: 'set', value: secrets[3] });
  const [character] = await database.insert(schema.characters).values({ tenantId: fixture.tenantId, creatorId: fixture.userId, name: '冻结角色名', cardData }).returning();
  const [persona] = await database.insert(schema.userPersonas).values({ tenantId: fixture.tenantId, userId: fixture.userId, name: '旅人', description: '冻结身份描述' }).returning();
  const [book] = await database.insert(schema.worldbooks).values({ tenantId: fixture.tenantId, userId: fixture.userId, characterId: character.id, name: 'Private book', scope: 'character' }).returning();
  await database.insert(schema.worldbookEntries).values({ worldbookId: book.id, keyword: '秘密', content: secrets[1], settings: { constant: true } });
  const creation = new ChatCreationService(database);
  const chat = (await creation.create(fixture.userId, fixture.tenantId, { characterId: character.id, personaId: persona.id, clientRequestId: randomUUID() })).chat;
  async function append(text, reply, interrupted = false) {
    const prepared = await prepareStoryTurn(chat, text, undefined, database);
    const [input] = await database.insert(schema.messages).values({ chatId: chat.id, role: 'user', content: text }).returning();
    return commitStoryTurn(prepared, input.id, randomUUID(), reply, interrupted, database);
  }
  const first = await append(rules.actions.find(action => action.id === 'permit').label, '已买到凭证，等待下一步。');
  for (let turn = 0; turn < 70; turn++) await append(`记录第${turn + 1}次观察`, `保存的观察正文${turn + 1}`, turn === 30);
  await addStoryNote(chat.id, fixture.userId, { kind: 'style', content: '保持简洁，记住约定。' }, database);
  await database.insert(schema.messages).values({ chatId: chat.id, role: 'system', content: secrets[7] });
  await database.insert(schema.characterMemories).values({ characterId: character.id, userId: fixture.userId, sourceChatId: chat.id, sourceMessageId: first.id, type: 'event', content: secrets[6] });
  await database.update(schema.messages).set({ extra: { stateStatus: 'confirmed', internal: secrets[8] } }).where(eq(schema.messages.id, first.id));
  await database.update(schema.userPersonas).set({ description: '修改后的身份' }).where(eq(schema.userPersonas.id, persona.id));
  await database.update(schema.characters).set({ name: '修改后的角色名' }).where(eq(schema.characters.id, character.id));
  const record = await exportStoryReading(chat.id, fixture.userId, fixture.tenantId, database);
  check('Exports every visible message beyond ordinary page limits', record.messages.length === 142 && record.messageCount === 142);
  check('Exports all 71 events beyond the panel and event-page limits in chronological order', record.eventCount === 71 && record.story.events.every((event, index) => event.version === index + 1));
  const messageIds = new Set(record.messages.map(message => message.id));
  const eventIds = new Set(record.story.events.map(event => event.id));
  check('Every exported event and visible state source resolves inside the reading record', record.story.events.every(event => messageIds.has(event.inputMessageId) && messageIds.has(event.messageId)) && record.story.fields.every(field => field.sourceEventId == null || eventIds.has(field.sourceEventId)));
  check('Interrupted text and events remain explicitly distinguishable', record.messages.filter(message => message.stateStatus === 'interrupted').length === 1 && record.story.events.filter(event => event.status === 'interrupted').length === 1);
  check('Identity and character names use the frozen opening', record.identity.description === '冻结身份描述' && record.characters[0].name === '冻结角色名');
  check('Preserves saved style, visible resources and known location', record.story.notes[0].content === '保持简洁，记住约定。' && record.story.fields.find(field => field.id === 'coins').value === 100 && record.story.map.location === 'harbor');
  check('Carries content and worldbook revisions without raw author payloads', /^[a-f0-9]{64}$/.test(record.snapshots.contentRevision) && /^[a-f0-9]{64}$/.test(record.snapshots.worldbookRevision));
  for (const format of ['json', 'txt', 'markdown']) {
    const output = format === 'json' ? JSON.stringify(record) : renderStoryReading(record, format);
    check(`${format} excludes private card, worldbook, state, undiscovered map, derived memory, system text and extra metadata`, secrets.every(secret => !output.includes(secret)));
  }
  check('Clearly identifies a reading record, not an importable backup', record.scope.restorable === false && record.scope.attachments === 'references-only');
  await assert.rejects(() => exportStoryReading(chat.id, fixture.outsiderId, fixture.tenantId, database), error => error.code === 'NOT_FOUND');
  check('A different owner cannot export the story', true);
  await assert.rejects(() => exportStoryReading(chat.id, fixture.userId, randomUUID(), database), error => error.code === 'NOT_FOUND');
  check('A mismatched tenant cannot export the story', true);
  const concurrentDatabase = {
    transaction: (read, config) => database.transaction(async transaction => {
      await transaction.select({ id: schema.chats.id }).from(schema.chats).where(eq(schema.chats.id, chat.id));
      await append('并发的新观察', '这条消息在导出快照之后提交。');
      await addStoryNote(chat.id, fixture.userId, { kind: 'note', content: '快照之后的新笔记' }, database);
      return read(transaction);
    }, config),
  };
  const concurrent = await exportStoryReading(chat.id, fixture.userId, fixture.tenantId, concurrentDatabase);
  check('Concurrent commits cannot mix newer messages, events or notes into an older export snapshot', concurrent.story.version === 71 && concurrent.eventCount === 71 && concurrent.messageCount === 142 && concurrent.story.notes.length === 1);
  const after = await exportStoryReading(chat.id, fixture.userId, fixture.tenantId, database);
  check('A later export consistently includes the newly committed turn and note', after.story.version === 72 && after.eventCount === 72 && after.messageCount === 144 && after.story.notes.length === 2);
  const [legacy] = await database.insert(schema.chats).values({ tenantId: fixture.tenantId, userId: fixture.userId, characterId: character.id, title: '旧故事' }).returning();
  await database.insert(schema.messages).values({ chatId: legacy.id, role: 'user', content: '旧故事正文' });
  const legacyExport = await exportStoryReading(legacy.id, fixture.userId, fixture.tenantId, database);
  check('Legacy stories export readable history without invented identity, state, map or revisions', legacyExport.messageCount === 1 && legacyExport.identity === null && legacyExport.story.legacy && legacyExport.story.fields.length === 0 && legacyExport.story.map === null && legacyExport.snapshots.contentRevision === null);
  check('Same-owner stories remain isolated', !JSON.stringify(after).includes('旧故事正文') && legacyExport.eventCount === 0);
  const [missingContent] = await database.insert(schema.chats).values({ tenantId: fixture.tenantId, userId: fixture.userId, characterId: character.id, contentSnapshotVersion: 1 }).returning();
  await assert.rejects(() => exportStoryReading(missingContent.id, fixture.userId, fixture.tenantId, database), error => error.code === 'STORY_CONTENT_UNAVAILABLE');
  check('Missing versioned character content fails instead of silently exporting an incomplete story', true);
  const [missingWorldbook] = await database.insert(schema.chats).values({ tenantId: fixture.tenantId, userId: fixture.userId, characterId: character.id, worldbookSnapshotVersion: 1 }).returning();
  await assert.rejects(() => exportStoryReading(missingWorldbook.id, fixture.userId, fixture.tenantId, database), error => error.code === 'STORY_WORLDBOOK_UNAVAILABLE');
  check('Missing versioned worldbook content fails instead of dropping its version reference', true);
  await database.delete(schema.chats).where(eq(schema.chats.id, chat.id));
  await assert.rejects(() => exportStoryReading(chat.id, fixture.userId, fixture.tenantId, database), error => error.code === 'NOT_FOUND');
  check('A deleted story cannot be exported again', true);
  await writeFile(process.env.STORY_EXPORT_BEHAVIOR, JSON.stringify({ checks, messageCount: record.messageCount, eventCount: record.eventCount, scope: 'actual service and database checks; synthetic content; no HTTP/browser/model' }, null, 2), { mode: 0o600 });
  console.info(`${checks.length} story reading export checks passed`);
} finally {
  await sql.end();
}
