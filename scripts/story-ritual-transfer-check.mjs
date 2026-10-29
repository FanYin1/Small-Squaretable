import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema/index.ts';
import { parseCharacterFile } from '../src/types/character-card-import.ts';
import { createCharacterWithWorldbook } from '../src/db/character-import.ts';
import { createAdapterJob, runNextAdapterJob } from '../src/server/services/story-adapter-jobs.service.ts';
import { ChatCreationService } from '../src/server/services/chat-creation.service.ts';
import { prepareStoryTurn, commitStoryTurn, getStoryState } from '../src/server/services/story-state.service.ts';
import { StoryCorrectionsService } from '../src/server/services/story-corrections.service.ts';

async function turn(database, chat, status = 'confirmed', input = '请继续讲述仪式。') {
  const prepared = await prepareStoryTurn(chat, input, undefined, database);
  const [message] = await database.insert(schema.messages).values({ chatId: chat.id, role: 'user', content: input }).returning();
  const output = status === 'proposed' ? `等待确认。\n<story-intent>${JSON.stringify({ version: 1, disposition: 'proposal',
    steps: [{ kind: 'explore', intent: 'talk', description: input, evidence: input }], facts: [] })}</story-intent>` : '咔咔认真回应了你。';
  const requestId = randomUUID();
  const response = await commitStoryTurn(prepared, message.id, requestId, output, status === 'interrupted', database);
  return { inputId: message.id, requestId, responseId: response.id };
}

export async function seedRitualTransfer(database, owner) {
  const bytes = await readFile(process.env.RITUAL_CARD_PATH);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'f11040eeb4ac883009ebb51cb9d3b1a2702f36da19d3b9a9600aa218d57c411e');
  const parsed = await parseCharacterFile(bytes);
  const character = await createCharacterWithWorldbook(database, { ...parsed.character, creatorId: owner.userId, tenantId: owner.tenantId });
  const job = await createAdapterJob(character.id, owner.userId, owner.tenantId, randomUUID(), database);
  await runNextAdapterJob(database);
  const [ready] = await database.select().from(schema.storyAdapterJobs).where(eq(schema.storyAdapterJobs.id, job.id));
  assert.equal(ready.artifact?.turnEffect, 'kakaa-ritual-v2');
  const chat = (await new ChatCreationService(database).create(owner.userId, owner.tenantId,
    { characterId: character.id, clientRequestId: randomUUID() })).chat;
  await turn(database, chat);
  await turn(database, chat, 'interrupted');
  await turn(database, chat, 'confirmed', '我是鸟神');
  await turn(database, chat, 'proposed');
  assert.equal((await getStoryState(chat.id, owner.userId, database)).fields[0].value, 6);
  const [content] = await database.select().from(schema.storyContent).where(eq(schema.storyContent.chatId, chat.id));
  return { chatId: chat.id, artifact: content.snapshot.characters[0].adaptation };
}

export async function verifyRitualTransfer(database, fixture, owner) {
  const [chat] = await database.select().from(schema.chats).where(eq(schema.chats.id, fixture.chatId));
  const [content] = await database.select().from(schema.storyContent).where(eq(schema.storyContent.chatId, chat.id));
  assert.deepEqual(content.snapshot.characters[0].adaptation, { ...fixture.artifact, characterId: chat.characterId });
  const state = await getStoryState(chat.id, owner.userId, database);
  assert.equal(state.version, 4);
  assert.equal(state.fields[0].value, 6);
  assert.equal(state.fields[1].value, true);
  const receipt = await turn(database, chat);
  assert.equal((await getStoryState(chat.id, owner.userId, database)).fields[0].value, 9);
  const retry = await prepareStoryTurn(chat, '请继续讲述仪式。', undefined, database);
  assert.equal((await commitStoryTurn(retry, receipt.inputId, receipt.requestId, '重复回执不执行', false, database)).id, receipt.responseId);
  assert.equal((await getStoryState(chat.id, owner.userId, database)).fields[0].value, 9);
  const corrections = new StoryCorrectionsService(database);
  const input = { requestId: randomUUID(), throughVersion: 1, mode: 'choice', direction: '换一个话题。', evidenceIds: [] };
  const preview = await corrections.preview(chat.id, owner.userId, owner.tenantId, input);
  assert.equal(preview.fields[0].value, 3);
  assert.equal(preview.fields.length, 1);
  const branch = await corrections.fork(chat.id, owner.userId, owner.tenantId, input, preview.digest);
  await turn(database, branch.chat);
  assert.equal((await getStoryState(branch.chat.id, owner.userId, database)).fields[0].value, 6);
  assert.equal((await getStoryState(branch.chat.id, owner.userId, database)).fields.length, 1);
  assert.equal((await getStoryState(chat.id, owner.userId, database)).fields[0].value, 9);
  return branch.chat.id;
}

export async function verifyRitualRestart(database, fixture, branchId, owner) {
  assert.equal((await getStoryState(fixture.chatId, owner.userId, database)).fields[0].value, 9);
  assert.equal((await getStoryState(fixture.chatId, owner.userId, database)).fields[1].value, true);
  assert.equal((await getStoryState(branchId, owner.userId, database)).fields[0].value, 6);
  const [chat] = await database.select().from(schema.chats).where(eq(schema.chats.id, fixture.chatId));
  await turn(database, chat);
  assert.equal((await getStoryState(chat.id, owner.userId, database)).fields[0].value, 12);
  assert.equal((await getStoryState(branchId, owner.userId, database)).fields[0].value, 6);
}
