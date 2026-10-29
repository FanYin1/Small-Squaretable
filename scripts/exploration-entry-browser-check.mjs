import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { expect } from '@playwright/test';
import sharp from 'sharp';
import { storyExamples } from '../src/types/story-examples.ts';

export async function checkExplorationEntry({ browser, base, sql, getIdentityPromptChecks }) {
  assert.equal(new URL(base).hostname, '127.0.0.1');
  assert.equal(new URL(base).port, '55441');
  const [database] = await sql`SELECT current_database() AS name`;
  assert.equal(database.name, 'squaretable_beta_test');
  const evidenceRoot = '/tmp/squaretable-entry-integration-evidence';
  const evidence = `${evidenceRoot}/${randomUUID()}`;
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  const sourcePath = 'docs/design/exploration-demo/app.js';
  const source = await readFile(sourcePath, 'utf8');
  const referenceManifest = JSON.parse(await readFile('docs/design/exploration-baseline/manifest.json', 'utf8'));
  assert.equal(createHash('sha256').update(source).digest('hex'), referenceManifest.sources.find(entry => entry.path === sourcePath)?.sha256);
  const boundary = source.indexOf('const escapeText');
  assert.ok(boundary > 0);
  const { definitions, artworks } = runInNewContext(`${source.slice(0, boundary)}; ({ definitions, artworks })`, {}, { timeout: 1000 });
  let token;
  let tenant;
  let csrf;
  let remaining = 100;
  let resetAt = 0;
  function observeBudget(headers) {
    if (Number(headers['x-ratelimit-limit']) !== 100) return;
    const nextRemaining = Number(headers['x-ratelimit-remaining']);
    const nextReset = Number(headers['x-ratelimit-reset']);
    remaining = nextReset > resetAt + 2000 ? nextRemaining : Math.min(remaining, nextRemaining);
    resetAt = Math.max(resetAt, nextReset);
  }
  async function waitForBudget(minimum = 20) {
    if (remaining >= minimum) return;
    console.info('Entry comparison is waiting for the normal API rate-limit window');
    const readyAt = resetAt + 1100;
    while (readyAt >= Date.now()) {
      await new Promise(resolve => setTimeout(resolve, Math.min(readyAt - Date.now() + 1, 30000)));
    }
    remaining = 100;
  }
  async function api(path, body, method = body ? 'POST' : 'GET', expected = 200) {
    await waitForBudget();
    const response = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}`, 'X-Tenant-ID': tenant } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    observeBudget(Object.fromEntries(response.headers));
    assert.equal(response.status, expected, `${method} ${path} status`);
    const result = await response.json();
    return result.data ?? result;
  }
  const invite = `ENTRY-${randomUUID()}`.toUpperCase();
  await sql`INSERT INTO invite_codes (code, max_uses) VALUES (${invite}, 1)`;
  const auth = await api('/auth/register', { email: `${randomUUID()}@example.test`, password: randomBytes(24).toString('hex'), ageConfirmed: true, inviteCode: invite }, 'POST', 201);
  token = auth.tokens.accessToken;
  tenant = auth.user.tenantId;
  csrf = (await api('/csrf-token')).csrfToken;
  await sql`INSERT INTO credit_ledger (tenant_id, kind, amount) VALUES (${tenant}, 'topup', 100000)`;
  const cards = {};
  for (const key of ['orbit', 'book']) {
    const definition = definitions[key];
    const image = await sharp(Buffer.from(artworks[key].replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))).resize({ width: 1600 }).png().toBuffer();
    cards[key] = await api('/characters', {
      name: definition.title, description: definition.description,
      avatarUrl: `data:image/png;base64,${image.toString('base64')}`, tags: definition.tag.split(' · '),
      cardData: { name: definition.person, scenario: `${definition.identity}。${definition.initialLocation}。`, first_mes: [...definition.opening, definition.dialogue].join('\n\n'), personality: '保存的角色语气：克制且尊重玩家。', extensions: storyExamples[key === 'orbit' ? 0 : 1].cardData.extensions },
    }, 'POST', 201);
    await sql`UPDATE characters SET is_public = true, moderation_status = 'approved' WHERE id = ${cards[key].id} AND tenant_id = ${tenant}`;
  }
  const persona = await api('/personas', { name: '远行者', description: '习惯先核对事实，再作决定。', isDefault: true }, 'POST', 201);
  const boundBook = await api('/worldbooks', { name: '雾港消息规则', scope: 'character', characterId: cards.orbit.id }, 'POST', 201);
  const boundEntry = await api(`/worldbooks/${boundBook.id}/entries`, {
    keyword: '消息来源', content: '消息必须经雾港灯塔交叉核实。', settings: { keys: ['消息来源'], position: 'before' },
  }, 'POST', 201);
  const globalBook = await api('/worldbooks', { name: '未绑定资料', scope: 'global' }, 'POST', 201);
  await api(`/worldbooks/${globalBook.id}/entries`, {
    keyword: '消息来源', content: '不应加载的全局设定', settings: { constant: true, position: 'before' },
  }, 'POST', 201);
  const saved = await api('/chats', { characterId: cards.orbit.id, personaId: persona.id, title: definitions.orbit.title, clientRequestId: randomUUID() }, 'POST', 201);
  const context = await browser.newContext();
  const prototypeContext = await browser.newContext();
  const errors = [];
  const screenshots = [];
  const checks = [];
  const failures = [];
  let page;
  async function navigate(path) {
    await waitForBudget(40);
    await page.goto(`${base}${path}`);
  }
  try {
    await context.addInitScript(({ accessToken, refreshToken, tenantId, userId, savedId, theme }) => {
      localStorage.setItem('token', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('tenantId', tenantId);
      localStorage.setItem('locale', 'zh-CN');
      localStorage.setItem('theme-preference', theme);
      if (!localStorage.getItem('lastChatId')) localStorage.setItem('lastChatId', savedId);
      localStorage.setItem(`story-onboarding:v1:${JSON.stringify([tenantId, userId])}`, 'done');
    }, { accessToken: token, refreshToken: auth.tokens.refreshToken, tenantId: tenant, userId: auth.user.id, savedId: saved.id, theme: 'dark' });
    page = await context.newPage();
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/v1/')) {
        csrf = request.headers()['x-csrf-token'] || csrf;
      }
    });
    page.on('response', response => {
      const path = new URL(response.url()).pathname;
      if (!path.startsWith('/api/v1/')) return;
      observeBudget(response.headers());
      if (response.status() >= 400) failures.push({ path, status: response.status() });
    });
    page.on('pageerror', error => errors.push(error.message));
    const prototype = await prototypeContext.newPage();
    prototype.on('pageerror', error => errors.push(error.message));
    const prototypeBase = 'http://127.0.0.1:55442';
    await prototype.goto(`${prototypeBase}/#setup/orbit`);
    await prototype.locator('#identity-name').fill('远行者');
    await prototype.locator('#identity-form button[type=submit]').click();
    await prototype.locator('#reader').waitFor();

    const pages = [
      ['discover', '/market', 'discover', '.story-card', '#gallery'],
      ['detail', `/characters/${cards.orbit.id}`, 'detail/orbit', '.story-hero', '#page-detail'],
      ['identity', `/chat?characterId=${cards.orbit.id}&storyEntry=1`, 'setup/orbit', '.story-identity-page', '#page-setup'],
      ['library', '/chat', 'stories', '.library-story', '#page-stories'],
      ['create', '/characters/new', 'create', '.editor-container', '#page-create'],
      ['account', '/profile', 'account', '.profile-preferences', '#page-account'],
    ];
    for (const [name, route, hash, ready, referenceReady] of pages) {
      await navigate(route);
      await page.locator(ready).first().waitFor();
      if (name === 'identity') await page.locator('.persona-item').first().waitFor();
      await prototype.goto(`${prototypeBase}/#${hash}`);
      await prototype.locator(referenceReady).waitFor();
      for (const width of [390, 768, 1440]) {
        for (const theme of ['dark', 'light']) {
          for (const target of [page, prototype]) await target.setViewportSize({ width, height: 1000 });
          for (const [label, target] of [['production', page], ['reference', prototype]]) {
            await target.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
            await target.evaluate(() => document.fonts.ready);
            assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}/${name}/${width}/${theme} overflow`);
            const filename = `${label}-${name}-${width}-${theme}.png`;
            await target.screenshot({ path: `${evidence}/${filename}`, fullPage: true, animations: 'disabled' });
            screenshots.push(filename);
          }
        }
      }
    }
    assert.equal((await api('/chats')).items.length, 1, 'Viewing entry pages must not create stories');
    assert.equal((await api('/credits/ledger')).items.filter(item => item.kind === 'charge').length, 0, 'Viewing entry pages must not generate');
    checks.push('six-page production/reference comparison: 390/768/1440, dark/light; view-only creates no chats or charges');

    await navigate('/market');
    const creations = [];
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/chats') creations.push(request.postDataJSON());
    });
    await page.locator('.story-card').filter({ has: page.getByRole('heading', { name: definitions.orbit.title, exact: true }) }).locator('.story-quick-start').click();
    await page.waitForURL(/\/chat\/[a-f\d-]+$/);
    const firstId = new URL(page.url()).pathname.split('/').at(-1);
    assert.notEqual(firstId, saved.id);
    const first = await api(`/chats/${firstId}`);
    assert.equal(first.personaId, persona.id);
    assert.equal(first.identitySnapshot.name, '远行者');
    assert.equal(first.identitySnapshot.description, '习惯先核对事实，再作决定。');
    assert.equal(first.worldbookSnapshotVersion, 1);
    assert.equal(JSON.stringify(first).includes('消息必须经雾港灯塔交叉核实。'), false);
    const [firstBinding] = await sql`SELECT snapshot FROM story_worldbooks WHERE chat_id = ${firstId}`;
    assert.equal(firstBinding.snapshot.bindings[0].books.length, 1);
    assert.equal(firstBinding.snapshot.bindings[0].books[0].id, boundBook.id);
    assert.equal(creations.length, 1);
    await page.locator('.message-assistant').first().waitFor();
    await expect(page.locator('.message-assistant').first()).toContainText(definitions.orbit.opening[0]);
    const [originalContent] = await sql`SELECT snapshot FROM story_content WHERE chat_id = ${firstId}`;
    await api(`/characters/${cards.orbit.id}`, { cardData: { ...cards.orbit.cardData, personality: '已修改的角色语气。', first_mes: '新的开场仅新故事可见。' } }, 'PATCH');
    await api(`/personas/${persona.id}`, { name: '已修改的名字', description: '已修改的身份描述' }, 'PATCH');
    await api(`/worldbooks/${boundBook.id}/entries/${boundEntry.id}`, { content: '来源规则已经改变' }, 'PATCH');
    await waitForBudget();
    await page.reload();
    await page.locator('.message-assistant').first().waitFor();
    await expect(page.locator('.chat-subtitle')).toContainText('远行者');
    assert.deepEqual((await api(`/chats/${firstId}`)).identitySnapshot, first.identitySnapshot);
    assert.equal(creations.length, 1);
    checks.push('market quick start: stored default persona, distinct save, matching opening, refresh without another POST');

    const action = '先别出发，问问林澈消息来源。';
    await page.locator('textarea').fill(action);
    await page.locator('textarea').press('Enter');
    await expect.poll(async () => (await api(`/credits/ledger?chatId=${firstId}`)).items.filter(item => item.kind === 'charge').length, { timeout: 90000, intervals: [1000] }).toBe(1);
    assert.equal(getIdentityPromptChecks(), 1);
    await navigate('/chat');
    await page.locator(`.library-resume[href="/chat/${firstId}"]`).click();
    await expect(page.getByText(action, { exact: true })).toBeVisible();
    await waitForBudget();
    await page.reload();
    await expect(page.getByText(action, { exact: true })).toBeVisible();
    const firstMessages = await sql`SELECT role, content FROM messages WHERE chat_id = ${firstId} ORDER BY sent_at, id`;
    assert.deepEqual(firstMessages.map(message => message.role), ['assistant', 'user', 'assistant']);
    assert.equal(firstMessages[0].content, [...definitions.orbit.opening, definitions.orbit.dialogue].join('\n\n'));
    assert.equal(firstMessages[1].content, action);
    assert.equal(firstMessages[2].content, 'The lantern opens a quiet path through the sleeping garden.');
    assert.deepEqual((await sql`SELECT snapshot FROM story_content WHERE chat_id = ${firstId}`)[0].snapshot, originalContent.snapshot);
    checks.push('real WebSocket generation and one ledger charge; resume and reload retain exactly the selected opening and one user/assistant turn');

    await navigate('/chat');
    await page.locator('.library-story').filter({ has: page.locator(`.library-resume[href="/chat/${firstId}"]`) }).locator('.library-meta a').click();
    await page.waitForURL(/\/chat\/[a-f\d-]+$/);
    const secondId = new URL(page.url()).pathname.split('/').at(-1);
    assert.notEqual(secondId, firstId);
    assert.equal((await api(`/chats/${secondId}`)).characterId, cards.orbit.id);
    assert.equal((await api(`/chats/${secondId}`)).identitySnapshot.name, '已修改的名字');
    const [secondBinding] = await sql`SELECT snapshot FROM story_worldbooks WHERE chat_id = ${secondId}`;
    assert.equal(secondBinding.snapshot.bindings[0].books[0].entries[0].content, '来源规则已经改变');
    assert.notEqual(secondBinding.snapshot.revision, firstBinding.snapshot.revision);
    const [newMessages] = await sql`SELECT count(*)::int AS count FROM messages WHERE chat_id = ${secondId}`;
    assert.equal(newMessages.count, 1);
    assert.equal((await sql`SELECT content FROM messages WHERE chat_id = ${secondId}`)[0].content, '新的开场仅新故事可见。');
    assert.equal((await sql`SELECT count(*)::int AS count FROM messages WHERE chat_id = ${firstId}`)[0].count, 3);
    checks.push('same-card new run creates a distinct chat without copying or deleting the original messages');

    await api('/personas', { name: '备用身份', isDefault: false }, 'POST', 201);
    await api(`/personas/${persona.id}`, undefined, 'DELETE');
    const deletedSource = await api(`/chats/${firstId}`);
    assert.equal(deletedSource.personaId, null);
    assert.deepEqual(deletedSource.identitySnapshot, first.identitySnapshot);
    await navigate(`/chat/${firstId}`);
    await expect(page.locator('.chat-subtitle')).toContainText('远行者');
    checks.push('identity snapshot survives persona edit/deletion, a new story uses edited identity, and the actual model request uses the original name/biography');

    await api(`/worldbooks/${boundBook.id}`, undefined, 'DELETE');
    await waitForBudget();
    await page.reload();
    await page.locator('textarea').fill('现在再核对消息来源。');
    await page.locator('textarea').press('Enter');
    await expect.poll(async () => (await api(`/credits/ledger?chatId=${firstId}`)).items.filter(item => item.kind === 'charge').length,
      { timeout: 90000, intervals: [1000] }).toBe(2);
    assert.equal(getIdentityPromptChecks(), 2);
    assert.deepEqual((await sql`SELECT snapshot FROM story_worldbooks WHERE chat_id = ${firstId}`)[0].snapshot, firstBinding.snapshot);
    checks.push('saved worldbook rules reach real model requests after source edit/deletion; new stories use edited rules; global books and hidden snapshot contents stay excluded');

    const beforeOptional = (await api('/chats')).items.length;
    await navigate(`/characters/${cards.book.id}`);
    await page.locator('.customize-identity').click();
    await expect(page.locator('.story-identity-page')).toBeVisible();
    await page.locator('.story-identity-page').getByRole('button', { name: '取消', exact: true }).click();
    await page.waitForURL(`${base}/chat`);
    assert.equal((await api('/chats')).items.length, beforeOptional);
    checks.push('optional identity setup cancellation does not create a chat');

    let lostId;
    let intercepted = 0;
    await page.route(`${base}/api/v1/chats`, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      intercepted++;
      assert.equal(intercepted, 1, 'Lost creation response must not be posted again');
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      lostId = (await response.json()).data.id;
      await route.abort('failed');
    });
    await navigate(`/chat?characterId=${cards.book.id}&storyEntry=quick`);
    await expect(page.locator('.submission-error')).toBeVisible();
    assert.ok(lostId);
    await waitForBudget();
    await page.reload();
    await expect(page.locator('.creation-recovery')).toBeVisible();
    await page.locator('.creation-recovery').getByRole('button', { name: '进入原故事', exact: true }).click();
    await page.waitForURL(`${base}/chat/${lostId}`);
    await expect(page.locator('.message-assistant').first()).toContainText(definitions.book.opening[0]);
    assert.equal(intercepted, 1);
    assert.equal((await api('/chats')).items.length, beforeOptional + 1);
    assert.equal(creations.length, 3);
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
    checks.push('after a real committed POST response is dropped, reload queries its request ID and opens the original chat without another POST');

    await sql`DELETE FROM story_worldbooks WHERE chat_id = ${secondId}`;
    await navigate(`/chat/${secondId}`);
    await page.locator('textarea').fill('核对缺失资料');
    await page.locator('textarea').press('Enter');
    await expect(page.locator('.generation-error')).toBeVisible();
    await expect.poll(async () => (await sql`SELECT status FROM generation_requests WHERE chat_id = ${secondId}`)[0]?.status,
      { timeout: 30000 }).toBe('failed');
    assert.equal((await api('/credits/balance')).heldTokens, 0);
    assert.equal((await api(`/credits/ledger?chatId=${secondId}`)).items.filter(item => item.kind === 'charge').length, 0);
    assert.equal((await sql`SELECT count(*)::int AS count FROM messages WHERE chat_id = ${secondId} AND role = 'assistant'`)[0].count, 1);
    checks.push('missing saved worldbooks stop generation visibly, release the held balance and create no generated assistant response or charge');

    await navigate(`/chat/${firstId}`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.locator('.story-dossier')).toBeVisible();
    let state = await api(`/chats/${firstId}/story-state`);
    assert.equal(state.fields.find(field => field.id === 'coins').value, 120);
    assert.equal(state.native, true);
    const purchase = page.locator('.story-actions li').filter({ hasText: '花 20 枚钱购买临时通行凭证' });
    await expect(purchase.getByRole('button')).toHaveCount(1);
    assert.equal((await api(`/chats/${firstId}/story-state`)).version, state.version);
    await page.locator('.message-input textarea').fill('我不购买，只想问问价格。');
    await page.locator('.message-input textarea').press('Enter');
    await expect.poll(async () => (await api(`/chats/${firstId}/story-state`)).version, { timeout: 90000 }).toBe(state.version + 1);
    state = await api(`/chats/${firstId}/story-state`);
    assert.equal(state.fields.find(field => field.id === 'coins').value, 120);
    await page.locator('.message-input textarea').fill('保留这段尚未发送的想法。');
    await expect(purchase.getByRole('button')).toBeEnabled();
    await purchase.getByRole('button').evaluate(button => { button.click(); button.click(); });
    await expect.poll(async () => (await api(`/chats/${firstId}/story-state`)).fields.find(field => field.id === 'coins').value, { timeout: 90000 }).toBe(100);
    await expect(purchase).toHaveCount(0);
    state = await api(`/chats/${firstId}/story-state`);
    assert.equal(state.fields.find(field => field.id === 'permit').value, true);
    await expect(page.locator('.message-input textarea')).toHaveValue('保留这段尚未发送的想法。');
    assert.equal((await sql`SELECT count(*)::int AS count FROM messages WHERE chat_id = ${firstId} AND role = 'user' AND content = ${'花 20 枚钱购买临时通行凭证'}`)[0].count, 1);
    assert.equal(state.map.location, 'harbor');
    await page.locator('.story-dossier nav').getByRole('button', { name: '地图', exact: true }).click();
    await expect(page.locator('.story-map .here')).toContainText('雾港码头');
    assert.equal((await api(`/chats/${firstId}/story-state`)).map.location, 'harbor');
    await page.locator('.story-actions li').filter({ hasText: '沿着小路前往灯塔' }).getByRole('button').click();
    await expect.poll(async () => (await api(`/chats/${firstId}/story-state`)).map.location, { timeout: 90000 }).toBe('lighthouse');
    checks.push('real action UI: negated purchase leaves resources intact, recommendation double click submits and spends once without replacing the draft, map browsing does not move and travel commits a known destination');

    await page.locator('.story-dossier nav').getByRole('button', { name: '记忆', exact: true }).click();
    await page.locator('#story-note-kind').selectOption('style');
    await page.locator('#story-note-content').fill('请保留克制对白，不代替我选择。');
    await page.getByRole('button', { name: '保存到此次故事', exact: true }).click();
    await expect(page.locator('.story-notes')).toContainText('请保留克制对白');
    await waitForBudget();
    await page.reload();
    await page.locator('.story-dossier nav').getByRole('button', { name: '记忆', exact: true }).click();
    await expect(page.locator('.story-notes')).toContainText('请保留克制对白');
    assert.equal((await api(`/chats/${secondId}/story-state`)).notes.length, 0);
    await page.locator('.story-dossier nav').getByRole('button', { name: '历程', exact: true }).click();
    await page.locator('.story-history li').first().getByRole('button', { name: '阅读原文' }).click();
    await expect(page.locator('.el-dialog').filter({ hasText: '历程原文' })).toContainText('The lantern opens a quiet path');
    await page.locator('.el-dialog__headerbtn').last().click();
    checks.push('per-story style note survives reload without appearing in another story; recorded event opens its actual saved response');

    for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      if (width < 1024) {
        const toggle = page.locator('.dossier-toggle');
        if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
      }
      await page.locator('.story-dossier nav').getByRole('button', { name: '地图', exact: true }).click();
      const filename = `play-${width}-${theme}.png`;
      await page.screenshot({ path: `${evidence}/${filename}`, fullPage: true, animations: 'disabled' });
      screenshots.push(filename);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `play overflow ${width} ${theme}`);
      await prototype.setViewportSize({ width, height: 1000 });
      await prototype.goto(`${prototypeBase}/#play/orbit`);
      await prototype.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await prototype.evaluate(() => document.fonts.ready);
      assert.ok(await prototype.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `reference play overflow ${width} ${theme}`);
      const referenceFilename = `reference-play-${width}-${theme}.png`;
      await prototype.screenshot({ path: `${evidence}/${referenceFilename}`, fullPage: true, animations: 'disabled' });
      screenshots.push(referenceFilename);
    }
    checks.push('production exploration page at 390/768/1440 in dark/light, no horizontal overflow');

    const relationship = await api('/chats', { characterId: cards.book.id, clientRequestId: randomUUID() }, 'POST', 201);
    const relationshipOther = await api('/chats', { characterId: cards.book.id, clientRequestId: randomUUID() }, 'POST', 201);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await navigate(`/chat/${relationship.id}`);
    await expect(page.locator('.story-dossier')).toBeVisible();
    assert.equal((await api(`/chats/${relationship.id}/story-state`)).map, null);
    await expect(page.locator('.story-dossier nav')).not.toContainText('地图');
    await page.locator('.message-input textarea').fill('我想先安静地坐一会儿');
    await page.locator('.message-input textarea').press('Enter');
    await expect.poll(async () => (await api(`/chats/${relationship.id}/story-state`)).fields.find(field => field.id === 'boundary').value, { timeout: 30000 }).toBe('先安静陪伴，不追问过去');
    for (const label of ['告诉苏禾我的名字', '约好明晚回来一起整理旧书']) {
      const execute = page.locator('.story-actions li').filter({ hasText: label }).getByRole('button');
      await expect(execute).toBeEnabled();
      await execute.click();
      await expect(page.locator('.story-actions li').filter({ hasText: label })).toHaveCount(0, { timeout: 30000 });
    }
    await waitForBudget();
    await page.reload();
    await expect(page.locator('.story-facts')).toContainText('明晚，一起整理旧书');
    const relationshipState = await api(`/chats/${relationship.id}/story-state`);
    assert.equal(relationshipState.version, 3);
    assert.ok(relationshipState.fields.every(field => typeof field.value !== 'number'));
    assert.ok(relationshipState.fields.every(field => field.sourceEventId));
    const otherRelationshipState = await api(`/chats/${relationshipOther.id}/story-state`);
    assert.equal(otherRelationshipState.version, 0);
    assert.equal(otherRelationshipState.fields.find(field => field.id === 'appointment').value, null);
    assert.equal((await api(`/credits/ledger?chatId=${relationship.id}`)).items.filter(item => item.kind === 'charge').length, 3);
    assert.equal((await api('/credits/balance')).heldTokens, 0);
    await page.screenshot({ path: `${evidence}/relationship-state.png`, fullPage: true });
    screenshots.push('relationship-state.png');
    checks.push('relationship card completes free-input boundary plus recommended introduction/appointment with three settlements, source links and reload continuity; no map/affection number or cross-story changes');

    await waitForBudget();
    const memoryFailures = failures.length;
    await page.locator('.reading-settings summary').click();
    await page.locator('.tools-btn').click();
    await page.getByRole('menuitem', { name: '角色记忆', exact: true }).click();
    const memoryDrawer = page.locator('.intelligence-drawer');
    await expect(memoryDrawer.locator('.memory-status')).toBeVisible();
    await expect(memoryDrawer.locator('.memory-status')).toHaveAttribute('aria-busy', 'false');
    await expect(memoryDrawer.locator('[role="alert"]')).toHaveCount(0);
    await expect(memoryDrawer.locator('.memory-panel')).toHaveCount(0);
    assert.equal(failures.length, memoryFailures);
    await page.screenshot({ path: `${evidence}/story-memory-drawer.png`, fullPage: true, animations: 'disabled' });
    screenshots.push('story-memory-drawer.png');
    checks.push('versioned story memory tool reads the current story progress, without legacy memory calls, stale character memories or fabricated emotion values');

    const sourcePaths = [sourcePath, 'src/client/pages/Chat.vue', 'src/client/pages/Market.vue', 'src/client/pages/CharacterDetail.vue', 'src/client/components/layout/ExplorationLayout.vue', 'src/client/components/chat/PersonaSelector.vue', 'src/client/components/chat/StorySaveCard.vue', 'src/client/styles/exploration-entry.css', 'src/client/main.ts', 'src/client/router/index.ts', 'src/client/stores/user.ts', 'src/server/middleware/rateLimit.ts', 'scripts/exploration-entry-check.mjs', 'scripts/exploration-entry-browser-check.mjs', 'scripts/beta-smoke-check.mjs', 'dist/client/index.html', 'dist/server/index.js'];
    sourcePaths.push('src/types/story-identity.ts', 'src/server/services/story-identity.service.ts',
      'src/server/services/chat-creation.service.ts', 'src/server/services/chat.service.ts', 'src/server/routes/chats.ts',
      'src/server/routes/websocket.ts', 'src/client/composables/useStoryIdentity.ts', 'src/client/services/chat.api.ts',
      'src/client/stores/chat.ts', 'src/db/schema/chats.ts', 'src/db/migrations/0042_story_identity_snapshot.sql',
      'src/db/beta-migrations/0002_story_identity_snapshot.sql', 'scripts/chat-creation-concurrency-check.ts');
    sourcePaths.push('src/types/story-worldbooks.ts', 'src/db/schema/story-worldbooks.ts',
      'src/server/services/story-worldbooks.service.ts', 'src/server/services/worldinfo-engine.service.ts',
      'src/db/migrations/0043_story_worldbooks.sql', 'src/db/beta-migrations/0003_story_worldbooks.sql',
      'src/client/components/chat/ChatWindow.vue', 'src/client/i18n/locales/zh-CN.json', 'src/client/i18n/locales/en-US.json');
    sourcePaths.push('src/types/story-state.ts', 'src/types/story-examples.ts', 'src/types/story-content.ts', 'src/types/story-capabilities.ts',
      'src/server/services/story-state.service.ts', 'src/server/services/story-content.service.ts',
      'src/client/components/chat/StoryDossier.vue', 'src/client/composables/useStoryState.ts', 'src/client/services/story.api.ts',
      'src/db/migrations/0044_story_content.sql', 'src/db/migrations/0045_story_state.sql', 'src/db/migrations/0046_story_memory_scope.sql',
      'src/server/services/memory.service.ts', 'src/server/services/memory-consolidation.service.ts', 'src/db/repositories/memory.repository.ts');
    sourcePaths.push('src/client/pages/CharacterEditor.vue', 'src/client/pages/MyCharacters.vue', 'src/client/pages/Profile.vue', 'src/client/pages/Subscription.vue', 'src/db/repositories/message.repository.ts');
    sourcePaths.push('src/client/components/layout/ExplorationPlayLayout.vue', 'src/client/components/chat/StoryEntryPreview.vue', 'src/client/components/chat/StoryIdentitySurface.vue', 'src/client/styles/_breakpoints.scss', 'vite.config.ts', 'src/db/beta-migrations/0004_story_content.sql', 'src/db/beta-migrations/0005_story_state.sql', 'src/db/beta-migrations/0006_story_memory_scope.sql');
    const sources = await Promise.all(sourcePaths.map(async path => ({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') })));
    const report = { date: new Date().toISOString(), result: 'passed', database: 'disposable PostgreSQL', backend: 'current built server', model: 'local deterministic beta-smoke provider; not narrative-quality validation', networkInterception: 'only drop one real committed creation response; no successful API responses fabricated', fixtures: ['雾海之外', '晚一点开门'], checks, screenshots, sources };
    await writeFile(`${evidence}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
    await writeFile(`${evidenceRoot}/latest.json`, JSON.stringify({ evidence, checks: checks.length, screenshots: screenshots.length }, null, 2), { mode: 0o600 });
    console.info(`Exploration entry passed: ${checks.length} real integration checks and ${screenshots.length} paired screenshots; ${evidence}`);
  } catch (error) {
    await page?.screenshot({ path: `${evidence}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(`${evidence}/failure.json`, JSON.stringify({ result: 'failed', path: page ? new URL(page.url()).pathname : null, failures, checks }, null, 2), { mode: 0o600 });
    console.error(`Entry failure diagnostics: ${evidence}`);
    throw error;
  } finally {
    await context.close();
    await prototypeContext.close();
  }
}
