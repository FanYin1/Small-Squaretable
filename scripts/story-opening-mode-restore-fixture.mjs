import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/db/schema/index.ts';
import { createCharacterWithWorldbook } from '../src/db/character-import.ts';
import { parseCharacterPng } from '../src/types/character-card-import.ts';
import { createCharacterSchema } from '../src/types/character.ts';
import { createAdapterJob, runNextAdapterJob, attachStoryAdaptation } from '../src/server/services/story-adapter-jobs.service.ts';
import { collectStorySources } from '../src/server/services/story-diagnostics.service.ts';
import { captureStoryContent, loadStoryContent } from '../src/server/services/story-content.service.ts';
import { buildStoryEntryProfile } from '../src/server/services/story-entry.service.ts';
import { ChatCreationService } from '../src/server/services/chat-creation.service.ts';
import { prepareStoryTurn, commitStoryTurn, getStoryState } from '../src/server/services/story-state.service.ts';
import { StoryCorrectionsService } from '../src/server/services/story-corrections.service.ts';

const address = new URL(process.env.DATABASE_URL);
assert.equal(address.hostname, '127.0.0.1');
assert.equal(address.pathname, '/squaretable_story_restore_test');
assert.equal(address.username, 'restore_check');
assert.ok(process.env.STORY_OPENING_MODE_FIXTURE);
const sql = postgres(address.toString(), { max: 2 });
const database = drizzle(sql, { schema });
const creation = new ChatCreationService(database);
const corrections = new StoryCorrectionsService(database);
const view = async chat => JSON.parse(JSON.stringify(await getStoryState(chat.id, chat.userId, database)));
const values = state => state.fields.map(field => [field.id, field.value]);

async function turn(chat, actionId, interrupted = false) {
  const before = await view(chat);
  const selected = before.actions.find(action => action.id === actionId);
  assert.ok(selected);
  const prepared = await prepareStoryTurn(chat, selected.label, { actionId, expectedVersion: before.version }, database);
  const [input] = await database.insert(schema.messages).values({ chatId: chat.id, role: 'user', content: selected.label }).returning();
  const requestId = randomUUID();
  const output = '确认本次选择，保留开局记录。';
  const message = await commitStoryTurn(prepared, input.id, requestId, output, interrupted, database);
  return { prepared, inputId: input.id, requestId, output, messageId: message.id };
}

try {
  if (process.argv[2] === 'seed') {
    const { userId, tenantId } = JSON.parse(await readFile(process.env.STORY_RESTORE_FIXTURE, 'utf8'));
    const cardPath = process.env.OPENING_MODE_CARD_PATH ?? '/mnt/e/Download/26.1角色卡/25年全中文备注角色卡（7500➕）/7500+卡/2025-11-19/2025-11-19/已分类/2025年3月前/正常向(不分类)/sans.png';
    const bytes = await readFile(cardPath);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), '297188b16b6fe4754ca4d9595711b6b67eae46595110f68b0703fd47ca8c1e19');
    const parsed = createCharacterSchema.parse(await parseCharacterPng(bytes));
    const character = await createCharacterWithWorldbook(database, { ...parsed, tenantId, creatorId: userId });
    await createAdapterJob(character.id, userId, tenantId, randomUUID(), database);
    await runNextAdapterJob(database);
    const sources = await collectStorySources(database, [character.id]);
    const content = captureStoryContent([character.id], userId, sources);
    await attachStoryAdaptation(database, content, sources);
    const profile = buildStoryEntryProfile(content, sources);
    assert.equal(profile.adaptation.reason, 'reviewed-opening-mode');
    const create = async () => (await creation.create(userId, tenantId, { characterId: character.id, clientRequestId: randomUUID(),
      opening: { characterId: character.id, revision: profile.revision, reference: { source: 'alternate_greetings', index: 0 }, reviewed: false } })).chat;
    const battle = await create();
    await turn(battle, 'sans-battle-mode', true);
    assert.equal((await view(battle)).actions.length, 2);
    const confirmed = await turn(battle, 'sans-battle-mode');
    const undecided = await create();
    const frozen = await loadStoryContent(battle.id, userId, database);
    await sql`UPDATE worldbook_entries SET content=content || E'\nSource edited after freezing' WHERE worldbook_id IN (SELECT id FROM worldbooks WHERE character_id=${character.id})`;
    await writeFile(process.env.STORY_OPENING_MODE_FIXTURE, JSON.stringify({ battle, undecided, confirmed, frozen,
      battleView: await view(battle), undecidedView: await view(undecided), userId, tenantId }), { mode: 0o600 });
    console.info('Opening-mode restore source seeded: original PNG, interrupted then confirmed choice, undecided story and later source edit.');
  } else {
    assert.equal(process.argv[2], 'verify');
    const saved = JSON.parse(await readFile(process.env.STORY_OPENING_MODE_FIXTURE, 'utf8'));
    assert.deepEqual(await view(saved.battle), saved.battleView);
    assert.deepEqual(await view(saved.undecided), saved.undecidedView);
    assert.deepEqual(await loadStoryContent(saved.battle.id, saved.userId, database), saved.frozen);
    const replay = saved.confirmed;
    assert.equal((await commitStoryTurn(replay.prepared, replay.inputId, replay.requestId, replay.output, false, database)).id, replay.messageId);
    assert.deepEqual(await view(saved.battle), saved.battleView);
    await turn(saved.undecided, 'sans-story-mode');
    assert.deepEqual(values(await view(saved.undecided)), [['sans-mode', '剧情模式'], ['sans-opening-lv', 0]]);
    const input = { requestId: randomUUID(), throughVersion: 0, mode: 'choice', direction: '在选择前改走和平剧情。', evidenceIds: [] };
    const preview = await corrections.preview(saved.battle.id, saved.userId, saved.tenantId, input);
    const branch = await corrections.fork(saved.battle.id, saved.userId, saved.tenantId, input, preview.digest);
    await turn(branch.chat, 'sans-story-mode');
    assert.deepEqual(values(await view(branch.chat)), [['sans-mode', '剧情模式'], ['sans-opening-lv', 0]]);
    const battleView = await view(saved.battle);
    assert.deepEqual(values(battleView), [['sans-mode', '战斗模式'], ['sans-opening-lv', 19], ['sans-opening-location', '审判长廊']]);
    assert.deepEqual(battleView.actions, []);
    await assert.rejects(() => prepareStoryTurn(saved.battle, '/剧情模式', { actionId: 'sans-story-mode', expectedVersion: battleView.version }, database));
    const output = { result: 'passed', additionalModelCalls: 0, checks: [
      'Whole-database dump restores frozen original rules, mode scope, sourced fields and interrupted/confirmed events',
      'Previously committed request replay cannot double-apply a choice after restore',
      'Restored undecided story can still choose story mode/Lv0 despite later source edits',
      'Restored pre-choice branch independently selects story mode while parent retains battle/Lv19/corridor',
      'Restored parent rejects selecting a second mode',
    ] };
    await writeFile(process.env.STORY_OPENING_MODE_BEHAVIOR, JSON.stringify(output, null, 2), { mode: 0o600 });
    console.info('Opening-mode restore continuation, replay and branch checks passed.');
  }
} finally {
  await sql.end({ timeout: 2 });
}
