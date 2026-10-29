import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';

export async function checkPresentationIntegration({ loader, database, sql, api, auth, page, base, directory, check }) {
  const { saveCharacterPresentation } = await loader.import('../src/server/services/character-presentation.service.ts', import.meta.url);
  const { collectPresentationSources, verifyPresentationSelection } = await loader.import('../src/server/services/story-presentation-workflow.ts', import.meta.url);
  const card = await api('/characters', { name: '场景摘录隔离验收', category: 'game', tags: ['Adventure'], cardData: {
    first_mes: '清晨，你走进旧车站。售票员放下报纸，耐心地等待你的问题。',
    alternate_greetings: ['暮色中的码头，船长递来一封来信，认真询问你想从哪里开始。'],
    personality: 'HIDDEN_PRIVATE_PERSONALITY', scenario: 'HIDDEN_PRIVATE_SCENARIO',
  } }, 201);
  async function source() {
    const [row] = await sql`SELECT id,name,description,card_data FROM characters WHERE id=${card.id}`;
    return { id: row.id, name: row.name, description: row.description, cardData: row.card_data };
  }
  function select(character, index) {
    const sources = collectPresentationSources(character);
    return verifyPresentationSelection(character, sources, { version: 1, candidateId: sources.candidates[index].id });
  }
  const original = await source();
  const old = await api('/chats', { characterId: card.id, clientRequestId: randomUUID() }, 201);
  const oldSnapshot = (await sql`SELECT snapshot FROM story_content WHERE chat_id=${old.id}`)[0].snapshot;
  await api(`/characters/${card.id}`);
  const previousProfile = await api(`/characters/${card.id}/story-entry`);
  const draft = select(original, 1);
  const input = { characterId: card.id, userId: auth.user.id, tenantId: auth.user.tenantId, requestId: randomUUID(), draft };
  const [saved, duplicate] = await Promise.all([saveCharacterPresentation(input, database), saveCharacterPresentation(input, database)]);
  assert.equal(saved.id, duplicate.id);
  await assert.rejects(() => saveCharacterPresentation({ ...input, draft: select(original, 0) }, database), /整理请求已用于其他内容/);
  for (const differentOwner of [{ userId: randomUUID() }, { tenantId: randomUUID() }]) {
    await assert.rejects(() => saveCharacterPresentation({ ...input, ...differentOwner, requestId: randomUUID() }, database));
  }
  const detail = await api(`/characters/${card.id}`);
  assert.equal(detail.presentation.id, saved.id);
  assert.equal(detail.description, original.description);
  assert.equal((await api('/characters')).items.find(item => item.id === card.id).presentation.id, saved.id);
  const profile = await api(`/characters/${card.id}/story-entry`);
  assert.equal(profile.description.text, draft.text);
  assert.equal(profile.presentation.id, saved.id);
  assert.notEqual(profile.revision, previousProfile.revision);
  await api('/chats', { characterId: card.id, clientRequestId: randomUUID(), opening: {
    characterId: card.id, revision: previousProfile.revision, reference: { source: 'first_mes', index: 0 }, reviewed: false,
  } }, 409);
  const story = await api('/chats', { characterId: card.id, clientRequestId: randomUUID(), opening: {
    characterId: card.id, revision: profile.revision, reference: { source: 'alternate_greetings', index: 0 }, reviewed: false,
  } }, 201);
  const frozen = (await sql`SELECT snapshot FROM story_content WHERE chat_id=${story.id}`)[0].snapshot;
  assert.equal(frozen.characters[0].presentation.id, saved.id);
  const { StoryCorrectionsService } = await loader.import('../src/server/services/story-corrections.service.ts', import.meta.url);
  const corrections = new StoryCorrectionsService(database);
  const branchInput = { requestId: randomUUID(), throughVersion: 0, mode: 'choice', direction: '从码头重新探索。', evidenceIds: [] };
  const preview = await corrections.preview(story.id, auth.user.id, auth.user.tenantId, branchInput);
  const branch = await corrections.fork(story.id, auth.user.id, auth.user.tenantId, branchInput, preview.digest);
  assert.deepEqual((await sql`SELECT snapshot FROM story_content WHERE chat_id=${branch.chat.id}`)[0].snapshot.characters[0].presentation, saved);
  assert.deepEqual((await sql`SELECT snapshot FROM story_content WHERE chat_id=${old.id}`)[0].snapshot, oldSnapshot);
  check('PR-01: immutable sourced versions, concurrent request dedup/conflict, owner/tenant rejection, cached-detail/list/profile refresh and atomic new-story freeze; old stories unchanged');

  await page.goto(`${base}/characters/${card.id}`);
  await expect(page.locator('.story-summary')).toContainText(draft.text);
  await expect(page.getByTestId('presentation-source')).toContainText('备选开场 1');
  await page.getByTestId('presentation-source').locator('summary').click();
  await expect(page.getByTestId('presentation-source')).toContainText('未概括全部设定与玩法');
  await page.screenshot({ path: `${directory}/presentation-detail-desktop.png`, fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: `${directory}/presentation-detail-mobile.png`, fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/characters/${card.id}/edit`);
  await expect(page.getByTestId('editor-presentation')).toContainText(draft.text);
  await expect(page.getByTestId('creator-preview')).toContainText(draft.text);
  await page.screenshot({ path: `${directory}/presentation-editor-desktop.png`, fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '用这段摘录编辑介绍', exact: true }).click();
  await expect(page.getByTestId('editor-presentation')).toHaveCount(0);
  await expect(page.getByTestId('creator-preview')).toContainText(draft.text);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '玩家预览', exact: true }).click();
  await expect(page.getByTestId('creator-preview')).toContainText(draft.text);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: `${directory}/presentation-editor-mobile.png`, fullPage: true, animations: 'disabled' });
  await page.reload();
  assert.deepEqual(await source(), original);
  check('PR-02: desktop/mobile detail source disclosure and creator preview; explicit editable adoption only, unsaved edits never overwrite the raw card');

  await sql`UPDATE characters SET is_public=true WHERE id=${card.id}`;
  assert.equal((await api(`/characters/${card.id}/story-entry`)).presentation, undefined);
  await sql`UPDATE characters SET is_public=false WHERE id=${card.id}`;
  const current = await source();
  await api(`/characters/${card.id}`, { description: '作者亲自修改并确认的介绍' }, 200, 'PATCH');
  assert.equal((await api(`/characters/${card.id}`)).presentation, undefined);
  assert.equal((await api(`/characters/${card.id}/story-entry`)).description.text, '作者亲自修改并确认的介绍');
  await assert.rejects(() => saveCharacterPresentation({ ...input, requestId: randomUUID() }, database));
  assert.equal((await saveCharacterPresentation(input, database)).id, saved.id);
  assert.deepEqual((await sql`SELECT snapshot FROM story_content WHERE chat_id=${story.id}`)[0].snapshot, frozen);
  assert.deepEqual((await sql`SELECT card_data FROM characters WHERE id=${card.id}`)[0].card_data, current.cardData);
  check('PR-03: unconfirmed derived content excluded from public entry, author edits win, stale writes rejected, old request receipt does not reapply and frozen source survives edits');
}
