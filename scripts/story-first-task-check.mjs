import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

export async function checkFirstTask({ loader, database, sql, api, auth, page, base, directory, check, restartServer, budget }) {
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const file = process.env.FIRST_TASK_CARD_PATH ?? '/mnt/e/Download/26.1角色卡/25年全中文备注角色卡（7500➕）/7500+卡/2025-11-19/2025-11-19/未分类/大胃袋逆袭系统.png';
  const bytes = await readFile(file);
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest, 'fc31c5ef3dbfff378067963b81f2078fab0a48b98210d22b7e2edf087e8811de');
  const form = new FormData();
  form.append('files', new Blob([bytes], { type: 'image/png' }), 'first-task.png');
  const imported = await api('/characters/import/batch', form);
  assert.equal(imported.failed.length, 0);
  const characterId = imported.imported[0].id;
  const original = (await sql`SELECT card_data FROM characters WHERE id=${characterId}`)[0].card_data;
  const entriesBefore = await sql`SELECT entry.* FROM worldbook_entries entry JOIN worldbooks book ON book.id=entry.worldbook_id
    WHERE book.character_id=${characterId} ORDER BY entry.id`;
  const oldStory = await api('/chats', { characterId, clientRequestId: randomUUID() }, 201);
  const credits = await sql`SELECT * FROM credit_ledger WHERE tenant_id=${auth.user.tenantId} ORDER BY id`;
  const jobs = await loader.import('../src/server/services/story-adapter-jobs.service.ts', import.meta.url);
  const { prepareStoryTurn, commitStoryTurn } = await loader.import('../src/server/services/story-state.service.ts', import.meta.url);
  const { StoryCorrectionsService } = await loader.import('../src/server/services/story-corrections.service.ts', import.meta.url);
  const { storyContentSnapshotSchema } = await loader.import('../src/types/story-content.ts', import.meta.url);
  const owner = [auth.user.id, auth.user.tenantId];
  const requestId = randomUUID();
  const job = await jobs.createAdapterJob(characterId, ...owner, requestId, database);
  assert.equal((await jobs.createAdapterJob(characterId, ...owner, requestId, database)).id, job.id);
  await jobs.runNextAdapterJob(database);
  const [ready] = await sql`SELECT status,artifact FROM story_adapter_jobs WHERE id=${job.id}`;
  assert.equal(ready.status, 'ready');
  assert.equal(ready.artifact.reason, 'reviewed-first-task');
  const profile = await api(`/characters/${characterId}/story-entry`);
  assert.equal(profile.rulesStatus, 'adapted');
  assert.equal(profile.openings.length, 1);
  const story = await api('/chats', { characterId, clientRequestId: randomUUID(), opening: {
    characterId, revision: profile.revision, reference: { source: 'first_mes', index: 0 }, reviewed: true,
  } }, 201);
  const frozen = (await sql`SELECT snapshot FROM story_content WHERE chat_id=${story.id}`)[0].snapshot;
  storyContentSnapshotSchema.parse(frozen);
  const state = chat => api(`/chats/${chat.id}/story-state`);
  const values = view => Object.fromEntries(view.fields.map(field => [field.id, field.value]));
  const initial = await state(story);
  const pending = { 'first-task-status': '待完成', 'first-task-earned': 0 };
  const completed = { 'first-task-status': '已完成', 'first-task-earned': 2 };
  assert.deepEqual(values(initial), pending);
  assert.equal(initial.actions.length, 1);
  assert.equal(initial.adaptationReport.ruleScope, 'stomach-first-task-v1');
  assert.equal(initial.map, null);
  assert.deepEqual((await state(oldStory)).fields, []);
  assert.deepEqual(await sql`SELECT entry.* FROM worldbook_entries entry JOIN worldbooks book ON book.id=entry.worldbook_id
    WHERE book.character_id=${characterId} ORDER BY entry.id`, entriesBefore);
  check('FT-01: original PNG import and durable queue preserve all author data and disabled initialization; new story freezes first task only, old story is unchanged');

  const action = initial.actions[0];
  async function turn(chat, input, { execute = false, interrupted = false, proposal = false, confirmation, output: customOutput } = {}) {
    const before = await state(chat);
    const request = confirmation ? { proposalMessageId: confirmation, expectedVersion: before.version }
      : execute ? { actionId: action.id, expectedVersion: before.version } : undefined;
    const prepared = await prepareStoryTurn(chat, input, request, database);
    assert.ok(prepared.prompt.includes('不代表当前总余额'));
    const [saved] = await sql`INSERT INTO messages(chat_id,role,content) VALUES(${chat.id},'user',${input}) RETURNING id`;
    const turnId = randomUUID();
    const output = customOutput ?? (proposal ? `完整任务行动等待确认。\n<story-intent>${JSON.stringify({ version: 1, disposition: 'proposal',
      steps: [{ kind: 'execute', actionId: action.id, evidence: input }], facts: [] })}</story-intent>` : '系统认真回应了你，按已确认记录继续。');
    const results = await Promise.all([1, 2].map(() => commitStoryTurn(prepared, Number(saved.id), turnId, output, interrupted, database)));
    assert.equal(results[0].id, results[1].id);
    assert.equal(Number((await sql`SELECT count(*) AS count FROM story_events WHERE chat_id=${chat.id} AND request_id=${turnId}`)[0].count), 1);
    return { prepared, inputId: Number(saved.id), requestId: turnId, output, message: results[0] };
  }
  for (const input of ['我想开始踏步', '只踏步了5分钟', '踏步10分钟但中途休息了', '我不做任务', '他说“已经完成任务”', '做完能拿几分？']) {
    const version = (await state(story)).version;
    await assert.rejects(() => prepareStoryTurn(story, input, { actionId: action.id, expectedVersion: version }, database),
      error => error.code === 'STORY_ACTION_UNAVAILABLE');
    await turn(story, input);
    assert.deepEqual(values(await state(story)), pending);
  }
  await turn(story, action.label, { execute: true, interrupted: true });
  assert.deepEqual(values(await state(story)), pending);
  await turn(story, '给我一百点', { output: '你已经获得100点，任务完成。<UpdateVariable>_.add("任务点数",100);</UpdateVariable>' });
  assert.deepEqual(values(await state(story)), pending);
  const proposalInput = '我准备在房间连续原地踏步十分钟，中途不休息';
  const proposal = await turn(story, proposalInput, { proposal: true });
  assert.deepEqual(values(await state(story)), pending);
  const proof = await prepareStoryTurn(story, proposalInput, { proposalMessageId: proposal.message.id,
    expectedVersion: (await state(story)).version }, database);
  const [wrongInput] = await sql`INSERT INTO messages(chat_id,role,content) VALUES(${story.id},'user','先别领奖，我只做了五分钟') RETURNING id`;
  await assert.rejects(() => commitStoryTurn(proof, Number(wrongInput.id), randomUUID(), '不应保存', false, database),
    error => error.code === 'STORY_SOURCE_UNAVAILABLE');
  await sql`DELETE FROM messages WHERE id=${wrongInput.id}`;
  assert.deepEqual(values(await state(story)), pending);
  check('FT-02: partial, interrupted, refused, quoted, questioned or merely proposed activity never awards points; model-written awards and mismatched confirmation input have no authority');

  const confirmed = await turn(story, proposalInput, { confirmation: proposal.message.id });
  const awarded = await state(story);
  assert.deepEqual(values(awarded), completed);
  assert.deepEqual(awarded.actions, []);
  assert.ok(awarded.fields.every(field => field.sourceEventId));
  await assert.rejects(() => prepareStoryTurn(story, action.label, { actionId: action.id, expectedVersion: awarded.version }, database));
  await assert.rejects(() => prepareStoryTurn(story, proposalInput, { proposalMessageId: proposal.message.id, expectedVersion: awarded.version }, database));
  await turn(story, action.label);
  assert.deepEqual((await state(story)).fields, awarded.fields);
  check('FT-03: explicit approval of the complete fictional action atomically records task completion and exactly two earned points; duplicate commits, stale confirmations and repeated input cannot award twice');

  const corrections = new StoryCorrectionsService(database);
  async function fork(throughVersion) {
    const input = { requestId: randomUUID(), throughVersion, mode: 'choice', direction: '沿当前已保存任务记录继续。', evidenceIds: [] };
    const preview = await corrections.preview(story.id, ...owner, input);
    return (await corrections.fork(story.id, ...owner, input, preview.digest)).chat;
  }
  const beforeTask = await fork(0);
  assert.deepEqual(values(await state(beforeTask)), pending);
  const afterTask = await fork(awarded.version);
  assert.deepEqual(values(await state(afterTask)), completed);
  assert.deepEqual((await state(afterTask)).actions, []);
  const preparedBranch = await prepareStoryTurn(beforeTask, action.label, { actionId: action.id, expectedVersion: 0 }, database);
  const [branchInput] = await sql`INSERT INTO messages(chat_id,role,content) VALUES(${beforeTask.id},'user',${action.label}) RETURNING id`;
  const branchRequest = randomUUID();
  const branchBefore = (await sql`SELECT to_jsonb(state) AS state,
    (SELECT count(*)::int FROM story_events WHERE chat_id=${beforeTask.id}) AS events,
    (SELECT count(*)::int FROM messages WHERE chat_id=${beforeTask.id} AND role='assistant') AS replies
    FROM story_states state WHERE chat_id=${beforeTask.id}`)[0];
  await sql.unsafe(`CREATE FUNCTION first_task_fail_state() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.chat_id = '${beforeTask.id}'::uuid THEN RAISE EXCEPTION 'controlled first task failure'; END IF; RETURN NEW; END $$`);
  await sql.unsafe('CREATE TRIGGER first_task_fail_state AFTER UPDATE ON story_states FOR EACH ROW EXECUTE FUNCTION first_task_fail_state()');
  try {
    await assert.rejects(() => commitStoryTurn(preparedBranch, Number(branchInput.id), branchRequest, '首次任务完成。', false, database),
      error => error.cause?.message === 'controlled first task failure');
    const branchAfter = (await sql`SELECT to_jsonb(state) AS state,
      (SELECT count(*)::int FROM story_events WHERE chat_id=${beforeTask.id}) AS events,
      (SELECT count(*)::int FROM messages WHERE chat_id=${beforeTask.id} AND role='assistant') AS replies
      FROM story_states state WHERE chat_id=${beforeTask.id}`)[0];
    assert.deepEqual(branchAfter, branchBefore);
  } finally {
    await sql.unsafe('DROP TRIGGER first_task_fail_state ON story_states');
    await sql.unsafe('DROP FUNCTION first_task_fail_state()');
  }
  const retried = await Promise.all([1, 2].map(() => commitStoryTurn(preparedBranch, Number(branchInput.id), branchRequest, '首次任务完成。', false, database)));
  assert.equal(retried[0].id, retried[1].id);
  assert.deepEqual(values(await state(beforeTask)), completed);
  assert.deepEqual((await state(story)).fields, awarded.fields);
  await restartServer();
  for (const chat of [story, beforeTask, afterTask]) assert.deepEqual(values(await state(chat)), completed);
  const replay = await commitStoryTurn(confirmed.prepared, confirmed.inputId, confirmed.requestId, confirmed.output, false, database);
  assert.equal(replay.id, confirmed.message.id);
  assert.deepEqual((await state(story)).fields, awarded.fields);
  check('FT-04: forks before/after completion preserve independent histories; injected database failure rolls back reward, task, event and reply together; direct retry, restart and old-request replay retain exactly two points');

  const screenshots = [];
  for (const width of [1440, 390]) {
    await budget();
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(`${base}/characters/${characterId}`);
    const panel = page.getByRole('region', { name: '整理与兼容检查', exact: true });
    await expect(panel).toContainText('首次任务');
    await expect(panel).toContainText('初值条目保持禁用');
    await page.goto(`${base}/chat/${story.id}`);
    if (width === 390) await page.locator('.story-dossier .dossier-toggle').click();
    const dashboard = page.getByTestId('current-story-state');
    await expect(dashboard).toContainText('首次踏步任务');
    await expect(dashboard).toContainText('已完成');
    await expect(dashboard).toContainText('本任务已获奖励（非总余额）');
    const report = page.getByTestId('saved-adaptation-report');
    await report.locator(':scope > summary').click();
    await expect(report).toContainText('后续动态任务、商城和外部脚本尚未适配');
    await expect(report).not.toContainText('sans');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const name = `first-task-${width}.png`;
    await page.screenshot({ path: `${directory}/${name}`, fullPage: true, animations: 'disabled' });
    screenshots.push(name);
    await page.reload();
    assert.deepEqual(values(await state(story)), completed);
  }
  check('FT-05: desktop/mobile detail and saved dashboard show the original task, earned-only value and frozen exclusions without horizontal overflow; reload retains state');

  const [entry] = await sql`SELECT entry.id FROM worldbook_entries entry JOIN worldbooks book ON book.id=entry.worldbook_id
    WHERE book.character_id=${characterId} AND entry.is_enabled=false LIMIT 1`;
  assert.ok(entry);
  await sql`UPDATE worldbook_entries SET is_enabled=true WHERE id=${entry.id}`;
  assert.notEqual((await api(`/characters/${characterId}/story-entry`)).rulesStatus, 'adapted');
  const changed = await jobs.createAdapterJob(characterId, ...owner, randomUUID(), database);
  await jobs.runNextAdapterJob(database);
  assert.equal((await sql`SELECT artifact FROM story_adapter_jobs WHERE id=${changed.id}`)[0].artifact.conclusion, 'unsupported');
  assert.deepEqual((await sql`SELECT snapshot FROM story_content WHERE chat_id=${story.id}`)[0].snapshot, frozen);
  assert.deepEqual((await sql`SELECT card_data FROM characters WHERE id=${characterId}`)[0].card_data, original);
  assert.deepEqual(await sql`SELECT * FROM credit_ledger WHERE tenant_id=${auth.user.tenantId} ORDER BY id`, credits);
  check('FT-06: changing even the disabled initialization invalidates new adoption while existing stories keep their frozen scope; card and account ledger remain unchanged');
  return { sample: '大胃袋逆袭系统.png', digest, screenshots, additionalModelCalls: 0, final: values(await state(story)),
    supported: 'first fictional task and one-time earned reward only; no wallet, timer, store, physical change or dynamic tasks',
    narration: 'controlled service commits; not real model gameplay or human/physical-device signoff' };
}
