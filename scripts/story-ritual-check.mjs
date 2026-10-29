import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { checkRitualIdentity } from './story-ritual-identity-check.mjs';

export async function checkReviewedRitual({ loader, database, sql, api, auth, page, base, directory, check, restartServer, budget }) {
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const file = process.env.RITUAL_CARD_PATH ?? '/mnt/e/Download/26.1角色卡/25年全中文备注角色卡（7500➕）/7500+卡/2025-11-19/2025-11-19/未分类/2025年3月前/kakaa.png';
  const bytes = await readFile(file);
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest, 'f11040eeb4ac883009ebb51cb9d3b1a2702f36da19d3b9a9600aa218d57c411e');
  const body = new FormData();
  body.append('files', new Blob([bytes], { type: 'image/png' }), 'kakaa.png');
  const imported = await api('/characters/import/batch', body);
  assert.equal(imported.failed.length, 0);
  const characterId = imported.imported[0].id;
  const original = (await sql`SELECT card_data FROM characters WHERE id=${characterId}`)[0].card_data;
  const oldStory = await api('/chats', { characterId, clientRequestId: randomUUID() }, 201);
  const jobs = await loader.import('../src/server/services/story-adapter-jobs.service.ts', import.meta.url);
  const { prepareStoryTurn, commitStoryTurn } = await loader.import('../src/server/services/story-state.service.ts', import.meta.url);
  const { StoryCorrectionsService } = await loader.import('../src/server/services/story-corrections.service.ts', import.meta.url);
  const owner = [auth.user.id, auth.user.tenantId];
  const job = await jobs.createAdapterJob(characterId, ...owner, randomUUID(), database);
  await jobs.runNextAdapterJob(database);
  const [ready] = await sql`SELECT status,artifact FROM story_adapter_jobs WHERE id=${job.id}`;
  if (ready.artifact?.reason !== 'reviewed-ritual') {
    const { collectStorySources } = await loader.import('../src/server/services/story-diagnostics.service.ts', import.meta.url);
    const { captureStoryContent } = await loader.import('../src/server/services/story-content.service.ts', import.meta.url);
    const sources = await collectStorySources(database, [characterId]);
    const content = captureStoryContent([characterId], auth.user.id, sources);
    await writeFile(`${directory}/ritual-source-debug-private.json`, JSON.stringify({ content, sources }), { mode: 0o600 });
  }
  assert.equal(ready.status, 'ready');
  assert.equal(ready.artifact.reason, 'reviewed-ritual');
  assert.equal(ready.artifact.turnEffect, 'kakaa-ritual-v2');
  assert.equal(ready.artifact.rules.actions.length, 0);
  const profile = await api(`/characters/${characterId}/story-entry`);
  assert.equal(profile.rulesStatus, 'adapted');
  assert.deepEqual(profile.initialFields, [{ id: 'kakaa-strength', label: '咔咔的力量（角色）', value: 0 }]);
  assert.equal(profile.openings[0].adaptationReport.turnEffect, 'kakaa-ritual-v2');
  const story = await api('/chats', { characterId, clientRequestId: randomUUID(), opening: {
    characterId, revision: profile.revision, reference: { source: 'first_mes', index: 0 }, reviewed: false,
  } }, 201);
  const frozen = (await sql`SELECT snapshot FROM story_content WHERE chat_id=${story.id}`)[0].snapshot;
  const state = chat => api(`/chats/${chat.id}/story-state`);
  assert.equal((await state(story)).fields[0].value, 0);
  assert.deepEqual((await state(oldStory)).fields, []);
  check('RT-01: original reviewed PNG imports through shared HTTP path; source-bound effect freezes with opening, zero initial NPC strength and no invented player action; old story stays unadapted');

  async function turn(chat, { interrupted = false, disposition = 'expression', invalid = false, confirmation } = {}) {
    const text = '请说说你的仪式';
    const before = await state(chat);
    const request = confirmation ? { proposalMessageId: confirmation, expectedVersion: before.version } : undefined;
    const prepared = await prepareStoryTurn(chat, text, request, database);
    assert.ok(prepared.prompt.includes('不是玩家属性'));
    const [input] = await sql`INSERT INTO messages(chat_id,role,content) VALUES(${chat.id},'user',${text}) RETURNING id`;
    const requestId = randomUUID();
    const output = invalid ? '未闭合的回复\n<story-intent>{' : `咔咔认真回应了你。\n<story-intent>${JSON.stringify({ version: 1, disposition,
      steps: disposition === 'proposal' ? [{ kind: 'explore', intent: 'talk', description: '请说说你的仪式', evidence: text }] : [], facts: [] })}</story-intent>`;
    const results = await Promise.all([1, 2].map(() => commitStoryTurn(prepared, Number(input.id), requestId, output, interrupted, database)));
    assert.equal(results[0].id, results[1].id);
    assert.equal(Number((await sql`SELECT count(*) AS count FROM story_events WHERE chat_id=${chat.id} AND request_id=${requestId}`)[0].count), 1);
    assert.equal((await state(chat)).version, before.version + 1);
    return results[0];
  }
  await turn(story);
  assert.equal((await state(story)).fields[0].value, 3);
  await turn(story, { interrupted: true });
  await turn(story, { invalid: true });
  assert.equal((await state(story)).fields[0].value, 3);
  const proposal = await turn(story, { disposition: 'proposal' });
  assert.equal((await state(story)).fields[0].value, 3);
  await turn(story, { confirmation: proposal.id });
  assert.equal((await state(story)).fields[0].value, 6);
  await assert.rejects(() => prepareStoryTurn(story, '请说说你的仪式', { proposalMessageId: proposal.id, expectedVersion: 5 }, database));
  await turn(story);
  assert.equal((await state(story)).fields[0].value, 9);
  const saved = (await sql`SELECT * FROM story_states WHERE chat_id=${story.id}`)[0];
  assert.equal(saved.completed_actions.length, 0);
  const source = (await sql`SELECT * FROM story_events WHERE id=${saved.sources['kakaa-strength']}`)[0];
  assert.deepEqual(source.changes, { 'kakaa-strength': { before: 6, after: 9 } });
  check('RT-02: saved real-card counter progresses 0/3/6/9; concurrent duplicate commits add once, interrupted/malformed/proposed turns add nothing, explicit confirmation adds once and stale confirmation rejects');

  const corrections = new StoryCorrectionsService(database);
  const branchInput = { requestId: randomUUID(), throughVersion: 1, mode: 'choice', direction: '换一个话题。', evidenceIds: [] };
  const preview = await corrections.preview(story.id, ...owner, branchInput);
  assert.equal(preview.fields[0].value, 3);
  const branch = await corrections.fork(story.id, ...owner, branchInput, preview.digest);
  await turn(branch.chat);
  assert.equal((await state(branch.chat)).fields[0].value, 6);
  assert.equal((await state(story)).fields[0].value, 9);
  assert.deepEqual((await sql`SELECT snapshot FROM story_content WHERE chat_id=${branch.chat.id}`)[0].snapshot.characters[0].adaptation, frozen.characters[0].adaptation);
  await restartServer();
  assert.equal((await state(story)).fields[0].value, 9);
  assert.equal((await state(branch.chat)).fields[0].value, 6);
  check('RT-03: correction prefix verifies each automatic delta; branch starts at 3 and reaches 6 independently of parent 9; both frozen effects and values survive server restart');

  const screenshots = [];
  for (const width of [1440, 390]) {
    await budget();
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(`${base}/characters/${characterId}`);
    await expect(page.getByRole('region', { name: '整理与兼容检查', exact: true })).toContainText('2 项状态 · 0 项有限行动 · 1 份来源');
    await expect(page.getByRole('region', { name: '整理与兼容检查', exact: true })).toContainText('不是玩家属性');
    const detail = `ritual-detail-${width}.png`;
    await page.screenshot({ path: `${directory}/${detail}`, fullPage: true, animations: 'disabled' });
    screenshots.push(detail);
    await page.goto(`${base}/chat/${story.id}`);
    if (width === 390) await page.locator('.story-dossier .dossier-toggle').click();
    const current = page.getByTestId('current-story-state');
    await expect(current).toContainText('咔咔的力量（角色）');
    await expect(current.locator('dd').first()).toContainText('9');
    const report = page.getByTestId('saved-adaptation-report');
    await report.locator(':scope > summary').click();
    await expect(report).toContainText('每轮已确认且完整保存的对话后+3');
    await expect(report).not.toContainText('条件与一次性触发');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const reader = `ritual-reader-${width}.png`;
    await page.screenshot({ path: `${directory}/${reader}`, fullPage: true, animations: 'disabled' });
    screenshots.push(reader);
  }
  check('RT-04: desktop/mobile detail and reader display the actual NPC counter and frozen scope, not player assets, an action menu or a generic promise of conditional rules');
  const identity = await checkRitualIdentity({ loader, database, sql, api, auth, page, base, directory, check, restartServer, budget, characterId, job });
  const [entry] = await sql`SELECT entry.id FROM worldbook_entries entry JOIN worldbooks book ON book.id=entry.worldbook_id WHERE book.character_id=${characterId} ORDER BY entry.position, entry.id LIMIT 1`;
  await sql`UPDATE worldbook_entries SET content=content || E'\n仪式改为每轮+30。' WHERE id=${entry.id}`;
  const changed = await jobs.createAdapterJob(characterId, ...owner, randomUUID(), database);
  await jobs.runNextAdapterJob(database);
  assert.equal((await sql`SELECT artifact FROM story_adapter_jobs WHERE id=${changed.id}`)[0].artifact.conclusion, 'unsupported');
  assert.notEqual((await api(`/characters/${characterId}/story-entry`)).rulesStatus, 'adapted');
  assert.deepEqual((await sql`SELECT snapshot FROM story_content WHERE chat_id=${story.id}`)[0].snapshot, frozen);
  await turn(story);
  assert.equal((await state(story)).fields[0].value, 12);
  assert.deepEqual((await sql`SELECT card_data FROM characters WHERE id=${characterId}`)[0].card_data, original);
  check('RT-05: edited bound lore disables conversion for new stories; existing frozen story continues +3, not edited +30; original imported card remains unchanged');
  return { sample: 'kakaa.png', digest, supported: 'reviewed exact-version NPC ritual counter and direct self-claim condition', screenshots: [...screenshots, ...identity.screenshots], identity, finalParent: 12, finalBranch: 6,
    actualSupplierCalls: 0, narration: 'controlled service commits, not real model quality acceptance' };
}
