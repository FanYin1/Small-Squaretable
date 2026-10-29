import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

export async function checkOpeningModes({ loader, database, sql, api, auth, page, base, directory, check, restartServer, budget }) {
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const file = process.env.OPENING_MODE_CARD_PATH ?? '/mnt/e/Download/26.1角色卡/25年全中文备注角色卡（7500➕）/7500+卡/2025-11-19/2025-11-19/已分类/2025年3月前/正常向(不分类)/sans.png';
  const bytes = await readFile(file);
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest, '297188b16b6fe4754ca4d9595711b6b67eae46595110f68b0703fd47ca8c1e19');
  const form = new FormData();
  form.append('files', new Blob([bytes], { type: 'image/png' }), 'sans.png');
  const imported = await api('/characters/import/batch', form);
  assert.equal(imported.failed.length, 0);
  const characterId = imported.imported[0].id;
  const original = (await sql`SELECT card_data FROM characters WHERE id=${characterId}`)[0].card_data;
  const oldStory = await api('/chats', { characterId, clientRequestId: randomUUID() }, 201);
  const beforeCredits = await sql`SELECT * FROM credit_ledger WHERE tenant_id=${auth.user.tenantId} ORDER BY id`;
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
  if (ready.artifact?.reason !== 'reviewed-opening-mode') {
    const { collectStorySources } = await loader.import('../src/server/services/story-diagnostics.service.ts', import.meta.url);
    const { captureStoryContent } = await loader.import('../src/server/services/story-content.service.ts', import.meta.url);
    const sources = await collectStorySources(database, [characterId]);
    const content = captureStoryContent([characterId], auth.user.id, sources);
    await writeFile(`${directory}/opening-mode-source-debug-private.json`, JSON.stringify({ content, sources }), { mode: 0o600 });
  }
  assert.equal(ready.status, 'ready');
  assert.equal(ready.artifact.reason, 'reviewed-opening-mode');
  const profile = await api(`/characters/${characterId}/story-entry`);
  assert.deepEqual(profile.openings.map(opening => opening.kind), ['directory', 'narrative']);
  assert.equal(profile.rulesStatus, 'adapted');
  const story = await api('/chats', { characterId, clientRequestId: randomUUID(), opening: {
    characterId, revision: profile.revision, reference: { source: 'alternate_greetings', index: 0 }, reviewed: false,
  } }, 201);
  const frozen = (await sql`SELECT snapshot FROM story_content WHERE chat_id=${story.id}`)[0].snapshot;
  storyContentSnapshotSchema.parse(frozen);
  const state = chat => api(`/chats/${chat.id}/story-state`);
  const initial = await state(story);
  assert.deepEqual(initial.fields.map(field => [field.id, field.value]), [['sans-mode', '未选择']]);
  assert.equal(initial.actions.length, 2);
  assert.equal(initial.map, null);
  assert.deepEqual((await state(oldStory)).fields, []);
  assert.equal(initial.adaptationReport.ruleScope, 'sans-opening-modes-v1');
  check('OM-01: original PNG imports, reviewed source compiles in the durable queue, narrow scope and two opening choices freeze; old story retains no adapted rules');

  async function rejectChangedInput(prepared, savedText) {
    const [source] = await sql`INSERT INTO messages(chat_id,role,content) VALUES(${story.id},'user',${savedText}) RETURNING id`;
    const before = (await sql`SELECT to_jsonb(state) AS state,
      (SELECT count(*)::int FROM messages WHERE chat_id=${story.id} AND role='assistant') AS replies,
      (SELECT count(*)::int FROM story_events WHERE chat_id=${story.id}) AS events
      FROM story_states state WHERE chat_id=${story.id}`)[0];
    await assert.rejects(() => commitStoryTurn(prepared, Number(source.id), randomUUID(), '不应写入的模式选择。', false, database),
      error => error.code === 'STORY_SOURCE_UNAVAILABLE');
    const after = (await sql`SELECT to_jsonb(state) AS state,
      (SELECT count(*)::int FROM messages WHERE chat_id=${story.id} AND role='assistant') AS replies,
      (SELECT count(*)::int FROM story_events WHERE chat_id=${story.id}) AS events
      FROM story_states state WHERE chat_id=${story.id}`)[0];
    assert.deepEqual(after, before);
    await sql`DELETE FROM messages WHERE id=${source.id} AND chat_id=${story.id}`;
  }
  const selected = await prepareStoryTurn(story, '/战斗模式', { actionId: 'sans-battle-mode', expectedVersion: 0 }, database);
  for (const savedText of ['/剧情模式', '我不选择战斗模式', '/战斗模式？', '/战斗模式 ']) {
    await rejectChangedInput(selected, savedText);
  }
  check('OM-SOURCE-01: real reviewed-card actions reject alternate, refused, questioned or whitespace-changed saved input without replies/events/state writes');

  async function turn(chat, input, { actionId, interrupted = false, proposal, confirmation } = {}) {
    const before = await state(chat);
    const request = confirmation ? { proposalMessageId: confirmation, expectedVersion: before.version }
      : actionId ? { actionId, expectedVersion: before.version } : undefined;
    const prepared = await prepareStoryTurn(chat, input, request, database);
    assert.ok(prepared.prompt.includes('显示的是开局记录'));
    const [savedInput] = await sql`INSERT INTO messages(chat_id,role,content) VALUES(${chat.id},'user',${input}) RETURNING id`;
    const turnId = randomUUID();
    const output = proposal ? `候选行动待确认。\n<story-intent>${JSON.stringify({ version: 1, disposition: 'proposal',
      steps: [{ kind: 'execute', actionId: proposal, evidence: input }], facts: [] })}</story-intent>` : 'sans认真回应了你的选择。';
    const results = await Promise.all([1, 2].map(() => commitStoryTurn(prepared, Number(savedInput.id), turnId, output, interrupted, database)));
    assert.equal(results[0].id, results[1].id);
    assert.equal(Number((await sql`SELECT count(*) AS count FROM story_events WHERE chat_id=${chat.id} AND request_id=${turnId}`)[0].count), 1);
    return { prepared, inputId: Number(savedInput.id), requestId: turnId, output, message: results[0] };
  }
  await assert.rejects(() => prepareStoryTurn(story, '/战斗模式', { actionId: 'unknown', expectedVersion: 0 }, database));
  await assert.rejects(() => prepareStoryTurn(story, '不选/战斗模式', { actionId: 'sans-battle-mode', expectedVersion: 0 }, database));
  for (const input of ['我不选择战斗模式', '他说“/战斗模式”', '/战斗模式？']) {
    await turn(story, input);
    assert.equal((await state(story)).fields[0].value, '未选择');
  }
  await turn(story, '/战斗模式', { actionId: 'sans-battle-mode', interrupted: true });
  assert.equal((await state(story)).actions.length, 2);
  const proposalInput = '我想选择战斗模式';
  const proposal = await turn(story, proposalInput, { proposal: 'sans-battle-mode' });
  assert.equal((await state(story)).fields[0].value, '未选择');
  const confirmation = await prepareStoryTurn(story, proposalInput, { proposalMessageId: proposal.message.id, expectedVersion: (await state(story)).version }, database);
  await rejectChangedInput(confirmation, '我不确认，改选剧情模式');
  check('OM-SOURCE-02: explicit proposal confirmation cannot settle against a saved refusal; the original pending choice stays available');
  check('OM-02: refusal, quoted command and question do not select a mode; mismatched actions reject; interrupted and unconfirmed proposed choices leave both modes available');

  const confirmed = await turn(story, proposalInput, { confirmation: proposal.message.id });
  const battle = await state(story);
  assert.deepEqual(battle.fields.map(field => [field.id, field.value]), [
    ['sans-mode', '战斗模式'], ['sans-opening-lv', 19], ['sans-opening-location', '审判长廊'],
  ]);
  assert.deepEqual(battle.actions, []);
  assert.equal(battle.map, null);
  assert.equal(battle.events[0].status, 'confirmed');
  assert.ok(battle.fields.every(field => field.sourceEventId));
  await assert.rejects(() => prepareStoryTurn(story, '/剧情模式', { actionId: 'sans-story-mode', expectedVersion: battle.version }, database));
  await assert.rejects(() => prepareStoryTurn(story, proposalInput, { proposalMessageId: proposal.message.id, expectedVersion: battle.version }, database));
  await turn(story, '/战斗模式');
  assert.deepEqual((await state(story)).fields, battle.fields);
  check('OM-03: explicit confirmation atomically sets battle/Lv19/corridor with source events; duplicate commit is idempotent, stale confirmation and alternate mode reject, free-text repetition cannot reset the opening');

  const corrections = new StoryCorrectionsService(database);
  const branchInput = { requestId: randomUUID(), throughVersion: 0, mode: 'choice', direction: '选择剧情模式，和平探索。', evidenceIds: [] };
  const preview = await corrections.preview(story.id, ...owner, branchInput);
  assert.equal(preview.fields[0].value, '未选择');
  const branch = await corrections.fork(story.id, ...owner, branchInput, preview.digest);
  assert.equal((await state(branch.chat)).actions.length, 2);
  await turn(branch.chat, '/剧情模式', { actionId: 'sans-story-mode' });
  assert.deepEqual((await state(branch.chat)).fields.map(field => [field.id, field.value]), [['sans-mode', '剧情模式'], ['sans-opening-lv', 0]]);
  assert.deepEqual((await state(branch.chat)).actions, []);
  assert.equal((await state(story)).fields[1].value, 19);
  assert.deepEqual((await sql`SELECT snapshot FROM story_content WHERE chat_id=${branch.chat.id}`)[0].snapshot.characters[0].adaptation, frozen.characters[0].adaptation);
  const afterInput = { ...branchInput, requestId: randomUUID(), throughVersion: battle.version };
  const afterPreview = await corrections.preview(story.id, ...owner, afterInput);
  const after = await corrections.fork(story.id, ...owner, afterInput, afterPreview.digest);
  assert.deepEqual((await state(after.chat)).actions, []);
  assert.equal((await state(after.chat)).fields[1].value, 19);
  await restartServer();
  assert.equal((await state(story)).fields[1].value, 19);
  assert.equal((await state(branch.chat)).fields[1].value, 0);
  const replay = await commitStoryTurn(confirmed.prepared, confirmed.inputId, confirmed.requestId, confirmed.output, false, database);
  assert.equal(replay.id, confirmed.message.id);
  assert.deepEqual((await state(story)).fields, battle.fields);
  check('OM-04: pre-choice branch selects story/Lv0 independently, post-choice branch retains the decision; server restart and old request replay preserve choices and source links');

  const screenshots = [];
  for (const width of [1440, 390]) {
    await budget();
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(`${base}/characters/${characterId}`);
    const panel = page.getByRole('region', { name: '整理与兼容检查', exact: true });
    await expect(panel).toContainText('首次模式选择');
    await expect(panel).toContainText('击杀经验');
    await expect(page.getByTestId('story-opening')).toContainText(profile.openings[1].preview);
    await expect(page.getByTestId('story-opening')).not.toContainText('本角色卡分享于以下');
    await page.screenshot({ path: `${directory}/opening-mode-detail-${width}.png`, fullPage: true, animations: 'disabled' });
    screenshots.push(`opening-mode-detail-${width}.png`);
    for (const [name, chat, level] of [['battle', story, '19'], ['story', branch.chat, '0']]) {
      await page.goto(`${base}/chat/${chat.id}`);
      if (width === 390) await page.locator('.story-dossier .dossier-toggle').click();
      const dashboard = page.getByTestId('current-story-state');
      await expect(dashboard).toContainText('开局Lv（不随经验更新）');
      await expect(dashboard).toContainText(level);
      const report = page.getByTestId('saved-adaptation-report');
      await report.locator(':scope > summary').click();
      await expect(report).toContainText('显示的是开局记录');
      await expect(report).toContainText('尚未适配');
      await expect(report).not.toContainText('已校验的赋值、增减、条件与一次性触发');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const nameOnDisk = `opening-mode-${name}-${width}.png`;
      await page.screenshot({ path: `${directory}/${nameOnDisk}`, fullPage: true, animations: 'disabled' });
      screenshots.push(nameOnDisk);
    }
  }
  check('OM-05: desktop/mobile details and both branch readers show real saved opening records and frozen exclusions; no invented map, current level or generic conversion claim');

  const [entry] = await sql`SELECT entry.id FROM worldbook_entries entry JOIN worldbooks book ON book.id=entry.worldbook_id WHERE book.character_id=${characterId} LIMIT 1`;
  await sql`UPDATE worldbook_entries SET content=content || E'\nChanged mode rules' WHERE id=${entry.id}`;
  assert.notEqual((await api(`/characters/${characterId}/story-entry`)).rulesStatus, 'adapted');
  const changed = await jobs.createAdapterJob(characterId, ...owner, randomUUID(), database);
  await jobs.runNextAdapterJob(database);
  assert.equal((await sql`SELECT artifact FROM story_adapter_jobs WHERE id=${changed.id}`)[0].artifact.conclusion, 'unsupported');
  assert.deepEqual((await sql`SELECT snapshot FROM story_content WHERE chat_id=${story.id}`)[0].snapshot, frozen);
  await turn(branch.chat, '看看周围');
  assert.equal((await state(branch.chat)).fields[1].value, 0);
  assert.deepEqual((await sql`SELECT card_data FROM characters WHERE id=${characterId}`)[0].card_data, original);
  assert.deepEqual(await sql`SELECT * FROM credit_ledger WHERE tenant_id=${auth.user.tenantId} ORDER BY id`, beforeCredits);
  check('OM-06: edited source disables new conversion; existing branches retain frozen mode semantics and continue without touching original card, credits or provider');
  return { sample: 'sans.png', digest, screenshots, additionalModelCalls: 0,
    supported: 'exact reviewed version, exclusive opening choice, not combat or experience',
    finalParent: (await state(story)).fields, finalBranch: (await state(branch.chat)).fields,
    narration: 'controlled service commits; not real model gameplay or human visual acceptance' };
}
