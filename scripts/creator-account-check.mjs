import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { storyExamples } from '../src/types/story-examples.ts';

export async function checkCreatorAccount({ browser, base, sql, getStreamCount }) {
  assert.equal(base, 'http://127.0.0.1:55441');
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const evidence = `/tmp/squaretable-creator-account-evidence/${randomUUID()}`;
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  const checks = [];
  const errors = [];
  const screenshots = [];
  const initialStreams = getStreamCount();
  let auth;
  let csrf;
  let remaining = 100;
  let resetAt = 0;
  function observe(headers) {
    if (Number(headers['x-ratelimit-limit']) !== 100) return;
    const nextReset = Number(headers['x-ratelimit-reset']);
    remaining = nextReset > resetAt + 2000 ? Number(headers['x-ratelimit-remaining']) : Math.min(remaining, Number(headers['x-ratelimit-remaining']));
    resetAt = Math.max(resetAt, nextReset);
  }
  async function budget() {
    if (remaining >= 40) return;
    console.info('Creator/account checks waiting for the normal API rate-limit window');
    while (Date.now() <= resetAt + 1100) await new Promise(resolve => setTimeout(resolve, Math.min(resetAt + 1101 - Date.now(), 30000)));
    remaining = 100;
  }
  async function api(path, body, method = body ? 'POST' : 'GET', expected = body ? 201 : 200) {
    await budget();
    const response = await fetch(`${base}/api/v1${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
    });
    observe(Object.fromEntries(response.headers));
    assert.equal(response.status, expected, `${method} ${path}`);
    const result = await response.json();
    return result.data ?? result;
  }
  const invite = `CREATOR-${randomUUID()}`.toUpperCase();
  await sql`INSERT INTO invite_codes (code, max_uses) VALUES (${invite}, 1)`;
  auth = await api('/auth/register', { email: `${randomUUID()}@example.test`, password: randomBytes(24).toString('hex'), ageConfirmed: true, inviteCode: invite });
  csrf = (await api('/csrf-token')).csrfToken;
  await sql`INSERT INTO credit_ledger (tenant_id, kind, amount) VALUES (${auth.user.tenantId}, 'topup', 150000)`;
  await sql`INSERT INTO subscriptions (tenant_id, plan, status) VALUES (${auth.user.tenantId}, 'pro', 'active')`;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await context.addInitScript(({ tokens, user }) => {
      localStorage.setItem('token', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);
      localStorage.setItem('tenantId', user.tenantId);
      localStorage.setItem('locale', 'zh-CN');
      localStorage.setItem('theme-preference', 'dark');
    }, auth);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => observe(response.headers()));
    async function navigate(path) { await budget(); await page.goto(`${base}${path}`); }
    async function screenshot(name) {
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: no horizontal overflow`);
      await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true, animations: 'disabled' });
      screenshots.push(`${name}.png`);
    }
    const cards = [];
    for (const [index, example] of storyExamples.entries()) {
      if (index > 1) break;
      await navigate('/my-characters');
      await page.locator('.characters-section').waitFor();
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: '导入角色卡', exact: true }).first().click(),
      ]);
      const name = `07AC机制${index + 1}`;
      await chooser.setFiles({ name: `mechanism-${index}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ spec: index ? 'chara_card_v3' : 'chara_card_v2', spec_version: index ? '3.0' : '2.0', data: { ...example.cardData, name, description: '待清空的简介', tags: ['Adventure'], extensions: { ...example.cardData.extensions, preserved_unknown: { value: index } } } })) });
      await expect(page.locator('.characters-section')).toContainText(name);
      const [card] = await sql`SELECT * FROM characters WHERE tenant_id = ${auth.user.tenantId} AND name = ${name}`;
      assert.ok(card);
      assert.equal(card.is_public, false);
      assert.equal(card.card_data.extensions.preserved_unknown.value, index);
      cards.push(card);
    }
    checks.push('Two distinct native mechanisms import through the real file picker, persist privately and preserve unknown extensions');

    await navigate('/characters/new');
    await page.getByTestId('creator-name').fill('工作台新作品');
    await page.getByTestId('creator-description').fill('一封从未寄出的信，等待你决定它的去向。');
    await page.locator('[data-step="people"]').click();
    await page.getByLabel('人物性格与行为', { exact: true }).fill('沉静、谨慎；隐藏的作者设定不应出现在玩家预览。');
    await page.locator('[data-step="openings"]').click();
    await page.getByTestId('creator-scene-text').fill('雨停了。你看见门缝里露出一角信封。');
    await page.getByRole('button', { name: '添加开场', exact: true }).click();
    await page.getByTestId('creator-scene-text').fill('钟声响起。{{user}}，有人在等你。');
    await page.getByRole('button', { name: '玩家预览', exact: true }).click();
    await page.getByRole('button', { name: '阅读正文', exact: true }).click();
    await expect(page.locator('.preview-prose')).toContainText('钟声响起。你，有人在等你。');
    await expect(page.getByTestId('creator-preview')).not.toContainText('隐藏的作者设定');
    await screenshot('workbench-mobile-reading-dark');
    await page.getByRole('button', { name: '编辑作品', exact: true }).click();
    await page.reload();
    await expect(page.getByTestId('creator-recovery')).toBeVisible();
    await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
    await expect(page.getByTestId('creator-name')).toHaveValue('工作台新作品');
    await screenshot('workbench-mobile-restored');
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const step of ['story', 'people', 'world', 'openings', 'review']) {
      await page.locator(`[data-step="${step}"]`).click();
      if (step === 'openings') {
        await page.locator('[data-scene="1"]').click();
        await expect(page.getByTestId('creator-scene-text')).toHaveValue('钟声响起。{{user}}，有人在等你。');
        await page.getByRole('button', { name: '开场准备', exact: true }).click();
      }
      await screenshot(`workbench-desktop-${step}-dark`);
    }
    await page.locator('.exploration-theme').click();
    await page.locator('[data-step="story"]').click();
    await page.getByRole('button', { name: '故事详情', exact: true }).click();
    await screenshot('workbench-desktop-story-light');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-step="people"]').click();
    await screenshot('workbench-mobile-people-light');
    const createResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/characters') && response.request().method() === 'POST');
    await page.getByRole('button', { name: '保存私有作品', exact: true }).click();
    assert.equal((await createResponse).status(), 201);
    await expect(page).toHaveURL(/my-characters/);
    const [created] = await sql`SELECT * FROM characters WHERE tenant_id = ${auth.user.tenantId} AND name = '工作台新作品'`;
    assert.equal(created.is_public, false);
    assert.equal(created.card_data.first_mes, '雨停了。你看见门缝里露出一角信封。');
    assert.deepEqual(created.card_data.alternate_greetings, ['钟声响起。{{user}}，有人在等你。']);
    assert.equal(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('squaretable:creator:')).length), 0);
    checks.push('Guided new private work persists real fields and alternate scenes after explicit refresh recovery; mobile edit/preview and desktop five-object steps in dark/light; static preview has no hidden author text');

    const trials = [];
    for (const opening of [0, 1]) {
      await navigate('/my-characters');
      const work = page.locator('.characters-grid > div').filter({ hasText: '工作台新作品' });
      await work.locator('.private-story-enter').click();
      await expect(page.getByTestId('opening-preparation')).toBeVisible();
      await page.locator(`[data-opening="${opening}"]`).click();
      const start = page.waitForResponse(response => response.url().endsWith('/api/v1/chats') && response.request().method() === 'POST');
      await page.getByTestId('opening-start').click();
      const response = await start;
      assert.equal(response.status(), 201);
      const result = await response.json();
      const trial = result.data ?? result;
      trials.push(trial.id);
      await expect(page.getByTestId('opening-preparation')).not.toBeVisible();
      await screenshot(`workbench-independent-trial-${opening}`);
      assert.equal((await api(`/chats/${trial.id}`)).characterId, created.id);
    }
    assert.notEqual(trials[0], trials[1]);
    assert.equal(getStreamCount(), initialStreams);
    checks.push('Library starts two independent trials through real opening selection and story creation; no model generation or shared story id');

    await api(`/characters/${cards[1].id}`, { avatarUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZsAAAAASUVORK5CYII=' }, 'PATCH', 200);
    await navigate(`/characters/${cards[1].id}/edit`);
    await expect(page.getByTestId('editor-save-status')).toContainText('私有作品');
    const importedOriginal = await api(`/characters/${cards[1].id}`);
    await page.getByRole('button', { name: '移除封面', exact: true }).click();
    await page.getByTestId('creator-description').fill('引导编辑中的新介绍');
    await page.route(`**/api/v1/characters/${cards[1].id}`, route => route.request().method() === 'PATCH' ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Injected save failure' } }) }) : route.continue());
    await page.locator('.form-actions button.el-button--primary').click();
    await expect(page.getByTestId('editor-save-status')).toContainText('尚未保存');
    assert.equal((await api(`/characters/${cards[1].id}`)).description, importedOriginal.description);
    await screenshot('workbench-mobile-save-failure');
    await page.unroute(`**/api/v1/characters/${cards[1].id}`);
    const guidedUpdate = page.waitForResponse(response => response.url().endsWith(`/api/v1/characters/${cards[1].id}`) && response.request().method() === 'PATCH');
    await page.locator('.form-actions button.el-button--primary').click();
    assert.equal((await guidedUpdate).status(), 200);
    await expect(page).toHaveURL(/my-characters/);
    const guidedSaved = await api(`/characters/${cards[1].id}`);
    assert.equal(guidedSaved.description, '引导编辑中的新介绍');
    assert.equal(guidedSaved.avatarUrl, null);
    for (const field of ['first_mes', 'alternate_greetings', 'character_book', 'post_history_instructions']) assert.deepEqual(guidedSaved.cardData[field], importedOriginal.cardData[field]);
    assert.deepEqual(guidedSaved.cardData.extensions.preserved_unknown, importedOriginal.cardData.extensions.preserved_unknown);
    checks.push('V3 imported card guided editing retains original scenes/books/unknown extensions; injected save failure preserves server state and supports retry');

    const card = cards[0];
    await navigate(`/characters/${card.id}/edit`);
    await expect(page.getByTestId('editor-save-status')).toContainText('私有作品');
    await page.getByRole('button', { name: '高级编辑', exact: true }).click();
    const inputs = page.locator('.editor-form .el-form-item');
    await inputs.filter({ hasText: '描述' }).first().locator('textarea').fill('');
    await expect(page.getByTestId('editor-save-status')).toContainText('尚未保存');
    await screenshot('editor-mobile-unsaved');
    const before = await api(`/characters/${card.id}`);
    assert.equal(before.description, '待清空的简介');
    await page.locator('.form-actions').getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.locator('.el-message-box')).toContainText('丢弃');
    await page.locator('.el-message-box').getByRole('button', { name: '取消', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/characters/${card.id}/edit`));
    const update = page.waitForResponse(response => response.url().endsWith(`/api/v1/characters/${card.id}`) && response.request().method() === 'PATCH');
    await page.locator('.form-actions button.el-button--primary').click();
    assert.equal((await update).status(), 200);
    await expect(page).toHaveURL(/my-characters/);
    const updated = await api(`/characters/${card.id}`);
    assert.equal(updated.description, '');
    assert.deepEqual(updated.cardData.extensions.preserved_unknown, { value: 0 });
    checks.push('Preview is local, canceling navigation retains edits, clearing description really persists and unknown extensions survive editing');

    await api(`/characters/${card.id}`, { category: 'game', tags: ['Adventure'] }, 'PATCH', 200);
    await navigate('/my-characters');
    const ownCard = page.locator('.characters-grid > div').filter({ hasText: card.name });
    await ownCard.locator('.private-story-more').click();
    await page.getByRole('menuitem', { name: '提交发布', exact: true }).click();
    await expect(page.getByTestId('publish-state')).toContainText('审核');
    await expect(page.locator('.story-publish-dialog .el-dialog__footer')).toBeInViewport();
    await page.locator('.story-publish-dialog .el-dialog__body').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(page.getByTestId('publish-preview')).toBeVisible();
    await expect(page.locator('.story-publish-dialog .el-dialog__footer')).toBeInViewport();
    await screenshot('publish-mobile');
    await page.locator('.el-dialog').getByRole('button', { name: '发布', exact: true }).click();
    await expect(page.locator('.el-dialog')).not.toBeVisible();
    const submitted = await api(`/characters/${card.id}`);
    assert.equal(submitted.isPublic, true);
    assert.equal(submitted.moderationStatus, 'pending');
    const discovered = await api(`/characters/search?q=${encodeURIComponent(card.name)}`);
    assert.ok(!JSON.stringify(discovered).includes(card.id), 'Pending work is not public discovery content');
    await page.getByRole('tab').filter({ hasText: '已发布' }).click();
    await expect(page.locator('.characters-section')).toContainText('待审核');
    checks.push('Publish uses the real service, shows pending review and does not make an unapproved work visible in discovery');

    await page.route(`**/api/v1/characters/${cards[1].id}`, route => route.request().method() === 'GET' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'TEMPORARY', message: 'Injected read failure' } }) }) : route.continue());
    await navigate(`/characters/${cards[1].id}/edit`);
    await expect(page.getByTestId('editor-save-status')).toHaveText('加载角色失败');
    await expect(page.locator('.form-actions button.el-button--primary')).toBeDisabled();
    await page.unroute(`**/api/v1/characters/${cards[1].id}`);
    await page.getByRole('button', { name: /重试/ }).first().click();
    await expect(page.getByTestId('editor-save-status')).toContainText('私有作品');
    checks.push('Failed editor reads retain a retry path and cannot overwrite server data with an empty form');

    await navigate('/profile');
    await page.locator('.profile-form .el-input__inner').fill('07AC验收账户');
    await page.locator('.profile-form textarea').fill('暂存简介');
    await screenshot('profile-before-save');
    await budget();
    const profileSave = page.waitForResponse(response => response.url().endsWith('/api/v1/users/me') && response.request().method() === 'PATCH');
    await page.locator('.profile-form .el-button--primary').click();
    assert.equal((await profileSave).status(), 200);
    assert.equal((await api('/users/me')).bio, '暂存简介');
    await page.locator('.profile-form textarea').fill('');
    const clearBio = page.waitForResponse(response => response.url().endsWith('/api/v1/users/me') && response.request().method() === 'PATCH');
    await page.locator('.profile-form .el-button--primary').click();
    assert.equal((await clearBio).status(), 200);
    assert.equal((await api('/users/me')).bio, '');
    await page.reload();
    await expect(page.locator('.profile-form textarea')).toHaveValue('');
    await screenshot('account-mobile');
    checks.push('Profile editing and explicitly clearing the biography persist through the real API and browser reload');

    await page.route('**/api/v1/credits/balance', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'TEMPORARY', message: 'Injected balance failure' } }) }));
    await navigate('/subscription?success=true');
    await expect(page.locator('.credits-error')).toBeVisible();
    assert.equal(await page.getByTestId('available-points').count(), 0);
    assert.equal(await page.getByText('订阅成功', { exact: true }).count(), 0);
    await page.unroute('**/api/v1/credits/balance');
    await page.locator('.credits-error button').click();
    await expect(page.getByTestId('available-points')).toHaveText('15');
    await expect(page.locator('.credits-ledger')).toContainText('充值');
    await screenshot('balance-mobile-recovered');
    checks.push('Balance failures never become zero balance, retry loads the real ledger and a forged success query does not report payment success');

    for (const imported of cards) {
      const story = await api('/chats', { characterId: imported.id, clientRequestId: randomUUID() });
      const original = await api(`/chats/${story.id}/characters`);
      await api(`/characters/${imported.id}`, { description: '编辑后的新介绍' }, 'PATCH', 200);
      assert.deepEqual(await api(`/chats/${story.id}/characters`), original);
      assert.equal((await api(`/chats/${story.id}`)).id, story.id);
    }
    checks.push('Both imported mechanisms create reloadable stories whose frozen content survives subsequent author edits');
    const [peer] = await sql`INSERT INTO users (tenant_id, email) VALUES (${auth.user.tenantId}, ${`${randomUUID()}@example.test`}) RETURNING id, tenant_id`;
    const [outsider] = await sql`SELECT id, tenant_id FROM users WHERE tenant_id <> ${auth.user.tenantId} LIMIT 1`;
    assert.ok(outsider);
    for (const author of [peer, outsider]) {
      const [privateCard] = await sql`INSERT INTO characters (tenant_id, creator_id, name, card_data) VALUES (${author.tenant_id}, ${author.id}, 'Protected author fixture', ${sql.json({ first_mes: 'Original private opening' })}) RETURNING id`;
      const beforeVersions = await sql`SELECT count(*) AS count FROM character_versions WHERE character_id = ${privateCard.id}`;
      await api(`/characters/${privateCard.id}`, { name: 'Unauthorized replacement' }, 'PATCH', 403);
      assert.deepEqual(await sql`SELECT count(*) AS count FROM character_versions WHERE character_id = ${privateCard.id}`, beforeVersions);
      assert.equal((await sql`SELECT name FROM characters WHERE id = ${privateCard.id}`)[0].name, 'Protected author fixture');
    }
    checks.push('Denied same-tenant and cross-tenant edits write neither character changes nor private history versions');
    assert.equal(getStreamCount(), initialStreams, 'Creator/account checks initiate no generation');
    assert.deepEqual(errors, []);
    const sources = [];
    for (const path of ['scripts/creator-account-check.mjs', 'dist/client/index.html', 'dist/server/index.js']) sources.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
    await writeFile(`${evidence}/report.json`, JSON.stringify({ result: 'passed', date: new Date().toISOString(), checks, screenshots, sources, model: 'isolated provider; no generation in these checks', scope: 'engineering behavior; not user visual or narrative acceptance' }, null, 2));
    console.info(`PASS: ${checks.length} creator/account groups; ${evidence}/report.json`);
  } catch (error) {
    await writeFile(`${evidence}/failure.json`, JSON.stringify({ result: 'failed', message: error.message, checks, screenshots, errors }, null, 2));
    throw error;
  } finally { await context.close(); }
}
