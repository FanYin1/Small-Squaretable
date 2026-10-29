import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';

export async function checkRitualIdentity({ loader, database, sql, api, auth, page, base, directory, check, restartServer, budget, characterId, job }) {
  const { ritualEffect, ritualRules } = await loader.import('../src/types/story-ritual.ts', import.meta.url);
  const { prepareStoryTurn, commitStoryTurn } = await loader.import('../src/server/services/story-state.service.ts', import.meta.url);
  const { StoryCorrectionsService } = await loader.import('../src/server/services/story-corrections.service.ts', import.meta.url);
  const owner = [auth.user.id, auth.user.tenantId];
  const corrections = new StoryCorrectionsService(database);
  const [current] = await sql`SELECT artifact FROM story_adapter_jobs WHERE id=${job.id}`;
  const legacyArtifact = { ...current.artifact, turnEffect: ritualEffect, rules: ritualRules() };
  await sql`UPDATE story_adapter_jobs SET artifact=${JSON.stringify(legacyArtifact)}::jsonb WHERE id=${job.id}`;
  assert.notEqual((await api(`/characters/${characterId}/story-entry`)).rulesStatus, 'adapted');
  assert.equal((await api(`/characters/${characterId}/adaptations`))[0].current, false);
  assert.deepEqual((await sql`SELECT artifact FROM story_adapter_jobs WHERE id=${job.id}`)[0].artifact, legacyArtifact);
  await sql`UPDATE story_adapter_jobs SET artifact=${JSON.stringify(current.artifact)}::jsonb WHERE id=${job.id}`;
  assert.equal((await api(`/characters/${characterId}/story-entry`)).rulesStatus, 'adapted');
  check('RI-01: obsolete v1 ready receipt remains immutable and cannot silently enable the v2 condition for new stories');

  const story = await api('/chats', { characterId, clientRequestId: randomUUID() }, 201);
  const [legacy] = await sql`INSERT INTO chats(user_id,tenant_id,character_id,title,content_snapshot_version)
    VALUES(${auth.user.id},${auth.user.tenantId},${characterId},'Historical v1 isolated fixture',1)
    RETURNING id,user_id AS "userId",character_id AS "characterId",content_snapshot_version AS "contentSnapshotVersion"`;
  const [saved] = await sql`SELECT snapshot FROM story_content WHERE chat_id=${story.id}`;
  const legacySnapshot = structuredClone(saved.snapshot);
  legacySnapshot.characters[0].adaptation = legacyArtifact;
  if (legacySnapshot.characters[0].adaptationReport) legacySnapshot.characters[0].adaptationReport.turnEffect = ritualEffect;
  await sql`INSERT INTO story_content(chat_id,snapshot) VALUES(${legacy.id},${JSON.stringify(legacySnapshot)}::jsonb)`;
  await sql`INSERT INTO story_states(chat_id,values) VALUES(${legacy.id},${JSON.stringify({ 'kakaa-strength': 0 })}::jsonb)`;
  const state = chat => api(`/chats/${chat.id}/story-state`);
  const values = async chat => (await sql`SELECT values FROM story_states WHERE chat_id=${chat.id}`)[0].values;
  const output = '咔咔认真回应。\n<story-intent>{"version":1,"disposition":"expression","steps":[],"facts":[]}</story-intent>';
  async function turn(chat, text, status = 'confirmed') {
    const prepared = await prepareStoryTurn(chat, text, undefined, database);
    const [input] = await sql`INSERT INTO messages(chat_id,role,content) VALUES(${chat.id},'user',${text}) RETURNING id`;
    const request = randomUUID();
    const response = status === 'proposed' ? `等待确认。\n<story-intent>${JSON.stringify({ version: 1, disposition: 'proposal',
      steps: [{ kind: 'explore', intent: 'talk', description: text, evidence: text }], facts: [] })}</story-intent>`
      : status === 'invalid' ? '未闭合\n<story-intent>{' : output;
    const replies = await Promise.all([1, 2].map(() => commitStoryTurn(prepared, Number(input.id), request, response, status === 'interrupted', database)));
    assert.equal(replies[0].id, replies[1].id);
    assert.equal(Number((await sql`SELECT count(*) AS count FROM story_events WHERE chat_id=${chat.id} AND request_id=${request}`)[0].count), 1);
    return prepared;
  }
  await turn(story, '我不是鸟神');
  for (const status of ['proposed', 'interrupted', 'invalid']) await turn(story, '我是鸟神', status);
  assert.deepEqual(await values(story), { 'kakaa-strength': 3, 'kakaa-identity-claim': false });
  assert.deepEqual((await state(story)).fields.map(field => field.id), ['kakaa-strength']);
  const prepared = await prepareStoryTurn(story, '我是鸟神', undefined, database);
  const [mismatch] = await sql`INSERT INTO messages(chat_id,role,content) VALUES(${story.id},'user','我不是鸟神') RETURNING id`;
  const beforeMismatch = await state(story);
  await assert.rejects(() => commitStoryTurn(prepared, Number(mismatch.id), randomUUID(), output, false, database), error => error.code === 'STORY_SOURCE_UNAVAILABLE');
  assert.deepEqual(await state(story), beforeMismatch);
  await sql`DELETE FROM messages WHERE id=${mismatch.id}`;
  check('RI-02: negative, pending, interrupted and malformed inputs do not trigger; mismatched saved input rejects atomically; concurrent duplicate receipts count once');

  const fork = async throughVersion => {
    const input = { requestId: randomUUID(), throughVersion, mode: 'choice', direction: '换一个话题。', evidenceIds: [] };
    const preview = await corrections.preview(story.id, ...owner, input);
    return (await corrections.fork(story.id, ...owner, input, preview.digest)).chat;
  };
  const before = await fork(1);
  const triggered = await turn(story, '我是鸟神');
  assert.ok(triggered.prompt.includes('not proof of divine powers'));
  assert.deepEqual(await values(story), { 'kakaa-strength': 6, 'kakaa-identity-claim': true });
  assert.deepEqual((await state(story)).fields.map(field => field.id), ['kakaa-strength', 'kakaa-identity-claim']);
  await turn(story, '我不是鸟神');
  assert.deepEqual(await values(story), { 'kakaa-strength': 9, 'kakaa-identity-claim': true });
  const after = await fork(5);
  await turn(before, '如果我是鸟神');
  assert.deepEqual(await values(before), { 'kakaa-strength': 6, 'kakaa-identity-claim': false });
  assert.deepEqual(await values(after), { 'kakaa-strength': 6, 'kakaa-identity-claim': true });
  check('RI-03: direct claim sets a persistent self-description record, exposes it only after triggering, grants no reward and forks independently before/after the actual claim');

  await turn(legacy, '我是鸟神');
  assert.deepEqual(await values(legacy), { 'kakaa-strength': 3 });
  await restartServer();
  assert.deepEqual(await values(story), { 'kakaa-strength': 9, 'kakaa-identity-claim': true });
  assert.deepEqual(await values(before), { 'kakaa-strength': 6, 'kakaa-identity-claim': false });
  assert.deepEqual(await values(after), { 'kakaa-strength': 6, 'kakaa-identity-claim': true });
  assert.deepEqual((await sql`SELECT snapshot FROM story_content WHERE chat_id=${legacy.id}`)[0].snapshot, legacySnapshot);
  await turn(legacy, '我是鸟神');
  assert.deepEqual(await values(legacy), { 'kakaa-strength': 6 });
  check('RI-04: restart preserves both branches and the claim; deliberately seeded historical v1 snapshot still counts +3 without adding new identity behavior');

  const screenshots = [];
  for (const width of [1440, 390]) {
    await budget();
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const [name, chat, visible] of [['hidden', before, false], ['triggered', story, true]]) {
      await page.goto(`${base}/chat/${chat.id}`);
      if (width === 390) await page.locator('.story-dossier .dossier-toggle').click();
      const currentState = page.getByTestId('current-story-state');
      await expect(currentState).toContainText('咔咔的力量（角色）');
      if (visible) await expect(currentState).toContainText('已向咔咔自称鸟神');
      else await expect(currentState).not.toContainText('鸟神');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const file = `ritual-identity-${name}-${width}.png`;
      await page.screenshot({ path: `${directory}/${file}`, fullPage: true, animations: 'disabled' });
      screenshots.push(file);
    }
  }
  check('RI-05: desktop/mobile actual readers hide the undiscovered claim, show it after saving and preserve separate branch states without horizontal overflow');
  return { checks: 5, screenshots, additionalSupplierCalls: 0, narration: 'controlled service commits, not real model quality acceptance',
    final: { parent: await values(story), before: await values(before), after: await values(after), legacy: await values(legacy) } };
}
